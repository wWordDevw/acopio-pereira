import { createHash } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  openDb,
  insertPunto,
  getPunto,
  listPuntos,
  listMovimientos,
  insertMovimientos,
  stockByPunto,
  hitRateLimit,
} from "./db.js";
import { validatePunto, validateMovimiento, validatePuntoId } from "./validate.js";
import { parseVoz } from "./parse-voz.js";
import { ETIQUETAS } from "./categorias.js";

const PUNTOS_LIMIT = { windowMs: 60 * 60 * 1000, limit: 30 };
const MOV_LIMIT = { windowMs: 60 * 1000, limit: 60 };

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function readBody(req, limit = 16_000) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("too_large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("json_invalido"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function clientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
      return forwarded.split(",")[0].trim();
    }
  }
  return req.socket.remoteAddress || "0.0.0.0";
}

function hashIp(ip) {
  return createHash("sha256").update(ip).digest("hex");
}

function publicPunto(row, inventario = []) {
  return {
    id: row.id,
    nombre: row.nombre,
    nota: row.nota,
    lat: row.lat,
    lng: row.lng,
    created_at: row.created_at,
    updated_at: row.updated_at,
    inventario: inventario.map((i) => ({
      categoria: i.categoria,
      etiqueta: ETIQUETAS[i.categoria] || i.categoria,
      stock: i.stock,
    })),
    tiene_stock: inventario.some((i) => i.stock > 0),
  };
}

function publicMovimiento(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    categoria: row.categoria,
    etiqueta: ETIQUETAS[row.categoria] || row.categoria,
    cantidad: row.cantidad,
    texto_original: row.texto_original,
    created_at: row.created_at,
    ajustado: Boolean(row.ajustado),
  };
}

export function createServer({ db, trustProxy = false }) {
  return createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const path = url.pathname;

      if (
        req.method === "GET" &&
        (path === "/api/salud" || path === "/api/health")
      ) {
        json(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" && path === "/api/puntos") {
        const rows = listPuntos(db);
        json(res, 200, {
          puntos: rows.map((r) => publicPunto(r, r.inventario)),
        });
        return;
      }

      if (req.method === "GET" && path.startsWith("/api/puntos/")) {
        const rest = path.slice("/api/puntos/".length);
        if (rest.includes("/")) {
          json(res, 404, { error: "no_encontrado" });
          return;
        }
        const idParsed = validatePuntoId(rest);
        if (!idParsed.ok) {
          json(res, idParsed.status, { error: idParsed.error });
          return;
        }
        const row = getPunto(db, idParsed.value);
        if (!row) {
          json(res, 404, { error: "no_encontrado" });
          return;
        }
        json(res, 200, {
          ...publicPunto(row, stockByPunto(db, row.id)),
          movimientos: listMovimientos(db, row.id, 30).map(publicMovimiento),
        });
        return;
      }

      if (req.method === "POST" && path === "/api/puntos") {
        const rate = hitRateLimit(
          db,
          `puntos:${hashIp(clientIp(req, trustProxy))}`,
          PUNTOS_LIMIT,
        );
        if (rate.limited) {
          json(res, 429, { error: "rate_limit" });
          return;
        }
        const body = await readBody(req);
        const parsed = validatePunto(body);
        if (!parsed.ok) {
          json(res, parsed.status, { error: parsed.error });
          return;
        }
        const result = insertPunto(db, parsed.value);
        json(res, result.created ? 201 : 200, publicPunto(result.row, []));
        return;
      }

      if (
        req.method === "POST" &&
        path.startsWith("/api/puntos/") &&
        path.endsWith("/movimientos")
      ) {
        const idRaw = path.slice(
          "/api/puntos/".length,
          path.length - "/movimientos".length,
        );
        const idParsed = validatePuntoId(idRaw);
        if (!idParsed.ok) {
          json(res, idParsed.status, { error: idParsed.error });
          return;
        }
        const punto = getPunto(db, idParsed.value);
        if (!punto) {
          json(res, 404, { error: "no_encontrado" });
          return;
        }

        const rate = hitRateLimit(
          db,
          `mov:${hashIp(clientIp(req, trustProxy))}`,
          MOV_LIMIT,
        );
        if (rate.limited) {
          json(res, 429, { error: "rate_limit" });
          return;
        }

        const body = await readBody(req);
        const parsed = validateMovimiento(body);
        if (!parsed.ok) {
          json(res, parsed.status, { error: parsed.error });
          return;
        }

        let items;
        if (parsed.value.texto) {
          const parsedItems = parseVoz(parsed.value.texto);
          if (parsedItems.length === 0) {
            json(res, 400, { error: "texto_invalido" });
            return;
          }
          items = parsedItems.map((it) => ({
            tipo: parsed.value.tipo,
            categoria: it.categoria,
            cantidad: it.cantidad,
            texto_original: it.texto_original,
          }));
        } else {
          items = [
            {
              tipo: parsed.value.tipo,
              categoria: parsed.value.categoria,
              cantidad: parsed.value.cantidad,
              texto_original: null,
            },
          ];
        }

        const result = insertMovimientos(db, {
          puntoId: punto.id,
          items,
          idempotency_key: parsed.value.idempotency_key,
        });
        const fresh = getPunto(db, punto.id);
        json(res, result.created ? 201 : 200, {
          ...publicPunto(fresh, stockByPunto(db, punto.id)),
          movimientos: listMovimientos(db, punto.id, 30).map(publicMovimiento),
          aplicados: result.rows.map(publicMovimiento),
        });
        return;
      }

      json(res, 404, { error: "no_encontrado" });
    } catch (err) {
      const status = err.status || 500;
      json(res, status, {
        error: status === 500 ? "error_interno" : err.message,
      });
    }
  });
}

export function listen(options = {}) {
  const sqlitePath =
    options.sqlitePath || process.env.SQLITE_PATH || "./data/acopio.sqlite";
  mkdirSync(dirname(sqlitePath), { recursive: true });
  const db = openDb(sqlitePath);
  const server = createServer({
    db,
    trustProxy: options.trustProxy ?? process.env.TRUST_PROXY === "1",
  });
  const port = Number(options.port ?? process.env.PORT ?? 3000);
  server.listen(port, options.host ?? "0.0.0.0");
  return server;
}

const invokedAsMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedAsMain) {
  listen();
}
