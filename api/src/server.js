import { createHash } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
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
  listProductos,
  getProducto,
  insertProducto,
  setProductoFoto,
} from "./db.js";
import {
  validatePunto,
  validateMovimiento,
  validatePuntoId,
  validateConsulta,
  validateInterpretar,
  validateProducto,
  validateFoto,
} from "./validate.js";
import { parseVoz } from "./parse-voz.js";
import { CATEGORIAS, ETIQUETAS } from "./categorias.js";
import { filtrarPuntos } from "./consultar.js";
import { buildOpenApi } from "./openapi.js";
import { swaggerHtml, swaggerInitJs } from "./swagger-html.js";
import {
  candidatosParecidos,
  findProductoEnLista,
} from "./productos.js";

const PUNTOS_LIMIT = { windowMs: 60 * 60 * 1000, limit: 30 };
const MOV_LIMIT = { windowMs: 60 * 1000, limit: 60 };

const CORS_GET = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function json(res, status, body, extra = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    ...CORS_GET,
    ...extra,
  });
  res.end(payload);
}

function sendText(res, status, body, contentType) {
  res.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    ...CORS_GET,
  });
  res.end(body);
}

function requestOrigin(req) {
  const protoHeader = req.headers["x-forwarded-proto"];
  const proto =
    typeof protoHeader === "string" && protoHeader.length > 0
      ? protoHeader.split(",")[0].trim()
      : "http";
  const hostHeader = req.headers["x-forwarded-host"] || req.headers.host;
  const host = typeof hostHeader === "string" ? hostHeader.split(",")[0].trim() : "";
  return host ? `${proto}://${host}` : "";
}

function queryFrom(url) {
  return {
    q: url.searchParams.get("q"),
    categoria: url.searchParams.get("categoria"),
    con_stock: url.searchParams.get("con_stock"),
    lat: url.searchParams.get("lat"),
    lng: url.searchParams.get("lng"),
    radio: url.searchParams.get("radio"),
    limit: url.searchParams.get("limit"),
  };
}

function listFiltered(db, parsed) {
  return filtrarPuntos(listPuntos(db), parsed);
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
      etiqueta: i.nombre || ETIQUETAS[i.categoria] || i.categoria,
      nombre: i.nombre || null,
      producto_id: i.producto_id || null,
      foto: i.producto_id && i.foto_path
        ? `/api/productos/${i.producto_id}/foto`
        : null,
      stock: i.stock,
    })),
    tiene_stock: inventario.some((i) => i.stock > 0),
    ...(row.distancia_km != null ? { distancia_km: row.distancia_km } : {}),
  };
}

function publicMovimiento(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    categoria: row.categoria,
    producto_id: row.producto_id || null,
    etiqueta: ETIQUETAS[row.categoria] || row.categoria,
    cantidad: row.cantidad,
    texto_original: row.texto_original,
    created_at: row.created_at,
    ajustado: Boolean(row.ajustado),
  };
}

function publicProducto(row) {
  const aliases = (() => {
    try {
      const parsed = JSON.parse(row.aliases || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  return {
    id: row.id,
    slug: row.slug,
    nombre: row.nombre,
    categoria: row.categoria,
    etiqueta: ETIQUETAS[row.categoria] || row.categoria,
    aliases,
    foto: row.foto_path ? `/api/productos/${row.id}/foto` : null,
  };
}

/** Strip spaces, +, dashes; keep only if 8–15 digits remain. */
export function normalizeWhatsappNumber(raw) {
  if (raw == null) return null;
  const digits = String(raw).replace(/[\s+\-]/g, "");
  if (digits.length === 0) return null;
  if (!/^\d{8,15}$/.test(digits)) return null;
  return digits;
}

export function createServer({
  db,
  trustProxy = false,
  whatsappNumber = null,
  fotosDir,
} = {}) {
  const photoDir = fotosDir || db.fotosDir;
  const whatsapp = normalizeWhatsappNumber(whatsappNumber);

  return createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const path = url.pathname;

      if (req.method === "OPTIONS" && path.startsWith("/api")) {
        res.writeHead(204, CORS_GET);
        res.end();
        return;
      }

      if (
        req.method === "GET" &&
        (path === "/api/salud" || path === "/api/health")
      ) {
        json(res, 200, { ok: true, whatsapp });
        return;
      }

      if (req.method === "GET" && path === "/api/docs/init.js") {
        sendText(res, 200, swaggerInitJs(), "text/javascript; charset=utf-8");
        return;
      }

      if (req.method === "GET" && path === "/api/docs") {
        sendText(res, 200, swaggerHtml(), "text/html; charset=utf-8");
        return;
      }

      if (req.method === "GET" && path === "/api/openapi.json") {
        json(res, 200, buildOpenApi({ serverUrl: requestOrigin(req) || "/" }));
        return;
      }

      if (req.method === "GET" && path === "/api") {
        json(res, 200, {
          nombre: "Insumos Pereira API",
          documentacion: "/api/docs",
          openapi: "/api/openapi.json",
          endpoints: {
            consultar: "GET /api/consultar",
            interpretar: "POST /api/interpretar",
            puntos: "GET /api/puntos",
            punto: "GET /api/puntos/:id",
            categorias: "GET /api/categorias",
            productos: "GET /api/productos",
            crear_punto: "POST /api/puntos",
            movimiento: "POST /api/puntos/:id/movimientos",
            salud: "GET /api/salud",
          },
        });
        return;
      }

      if (req.method === "GET" && path === "/api/categorias") {
        json(res, 200, {
          categorias: CATEGORIAS.map((slug) => ({
            slug,
            etiqueta: ETIQUETAS[slug],
          })),
        });
        return;
      }

      if (req.method === "GET" && path === "/api/productos") {
        const categoria = url.searchParams.get("categoria") || null;
        if (categoria && !CATEGORIAS.includes(categoria)) {
          json(res, 400, { error: "categoria_invalida" });
          return;
        }
        const q = url.searchParams.get("q") || "";
        json(res, 200, {
          productos: listProductos(db, { categoria, q }).map(publicProducto),
        });
        return;
      }

      if (req.method === "POST" && path === "/api/productos") {
        const body = await readBody(req);
        const parsed = validateProducto(body);
        if (!parsed.ok) {
          json(res, parsed.status, { error: parsed.error });
          return;
        }
        const todos = listProductos(db, { categoria: parsed.value.categoria });
        const exacto = findProductoEnLista(
          todos,
          parsed.value.nombre,
          parsed.value.categoria,
        );
        if (exacto) {
          json(res, 200, publicProducto(exacto));
          return;
        }
        const parecidos = candidatosParecidos(
          todos,
          parsed.value.nombre,
          parsed.value.categoria,
        );
        if (parecidos.length) {
          json(res, 409, {
            error: "posible_duplicado",
            candidatos: parecidos.map(publicProducto),
          });
          return;
        }
        const result = insertProducto(db, parsed.value);
        json(res, result.created ? 201 : 200, publicProducto(result.row));
        return;
      }

      if (
        req.method === "GET" &&
        path.startsWith("/api/productos/") &&
        path.endsWith("/foto")
      ) {
        const idRaw = path.slice(
          "/api/productos/".length,
          path.length - "/foto".length,
        );
        const idParsed = validatePuntoId(idRaw);
        if (!idParsed.ok) {
          json(res, idParsed.status, { error: idParsed.error });
          return;
        }
        const prod = getProducto(db, idParsed.value);
        if (!prod || !prod.foto_path) {
          json(res, 404, { error: "no_encontrado" });
          return;
        }
        try {
          const buf = readFileSync(prod.foto_path);
          const ext = extname(prod.foto_path).toLowerCase();
          const mime =
            ext === ".png"
              ? "image/png"
              : ext === ".webp"
                ? "image/webp"
                : "image/jpeg";
          res.writeHead(200, {
            "content-type": mime,
            "content-length": buf.length,
            "cache-control": "public, max-age=86400",
            ...CORS_GET,
          });
          res.end(buf);
        } catch {
          json(res, 404, { error: "no_encontrado" });
        }
        return;
      }

      if (
        req.method === "POST" &&
        path.startsWith("/api/productos/") &&
        path.endsWith("/foto")
      ) {
        const idRaw = path.slice(
          "/api/productos/".length,
          path.length - "/foto".length,
        );
        const idParsed = validatePuntoId(idRaw);
        if (!idParsed.ok) {
          json(res, idParsed.status, { error: idParsed.error });
          return;
        }
        const prod = getProducto(db, idParsed.value);
        if (!prod) {
          json(res, 404, { error: "no_encontrado" });
          return;
        }
        const body = await readBody(req);
        const parsed = validateFoto(body);
        if (!parsed.ok) {
          json(res, parsed.status, { error: parsed.error });
          return;
        }
        let buf;
        try {
          buf = Buffer.from(parsed.value.imagen_base64, "base64");
        } catch {
          json(res, 400, { error: "foto_invalida" });
          return;
        }
        if (buf.length < 8 || buf.length > 800_000) {
          json(res, 400, { error: "foto_grande" });
          return;
        }
        const ext =
          parsed.value.mime === "image/png"
            ? ".png"
            : parsed.value.mime === "image/webp"
              ? ".webp"
              : ".jpg";
        const dest = join(photoDir, `${prod.id}${ext}`);
        mkdirSync(photoDir, { recursive: true });
        writeFileSync(dest, buf);
        json(res, 200, publicProducto(setProductoFoto(db, prod.id, dest)));
        return;
      }

      if (req.method === "GET" && path === "/api/consultar") {
        const parsed = validateConsulta(queryFrom(url));
        if (!parsed.ok) {
          json(res, parsed.status, { error: parsed.error });
          return;
        }
        const rows = listFiltered(db, parsed.value);
        json(res, 200, {
          consulta: parsed.value,
          total: rows.length,
          puntos: rows.map((r) => publicPunto(r, r.inventario)),
        });
        return;
      }

      if (req.method === "GET" && path === "/api/puntos") {
        const parsed = validateConsulta(queryFrom(url));
        if (!parsed.ok) {
          json(res, parsed.status, { error: parsed.error });
          return;
        }
        const rows = listFiltered(db, parsed.value);
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

      if (req.method === "POST" && path === "/api/interpretar") {
        const body = await readBody(req);
        const parsed = validateInterpretar(body);
        if (!parsed.ok) {
          json(res, parsed.status, { error: parsed.error });
          return;
        }
        const items = parseVoz(parsed.value.texto);
        if (items.length === 0) {
          json(res, 400, { error: "texto_invalido" });
          return;
        }
        json(res, 200, { texto: parsed.value.texto, items });
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
        if (parsed.value.items) {
          items = parsed.value.items.map((it) => ({
            tipo: parsed.value.tipo,
            categoria: it.categoria,
            cantidad: it.cantidad,
            texto_original: it.texto_original,
            producto_id: it.producto_id || null,
          }));
        } else if (parsed.value.texto) {
          const parsedItems = parseVoz(parsed.value.texto);
          if (parsedItems.length === 0) {
            json(res, 400, { error: "texto_invalido" });
            return;
          }
          const catalogo = listProductos(db);
          items = parsedItems.map((it) => {
            const hit = findProductoEnLista(
              catalogo,
              it.frase || it.texto_original,
              it.categoria,
            );
            return {
              tipo: parsed.value.tipo,
              categoria: it.categoria,
              cantidad: it.cantidad,
              texto_original: it.texto_original,
              producto_id: hit?.id || null,
            };
          });
        } else if (parsed.value.producto_id) {
          const prod = getProducto(db, parsed.value.producto_id);
          if (!prod) {
            json(res, 404, { error: "no_encontrado" });
            return;
          }
          items = [
            {
              tipo: parsed.value.tipo,
              categoria: prod.categoria,
              producto_id: prod.id,
              cantidad: parsed.value.cantidad,
              texto_original: null,
            },
          ];
        } else {
          items = [
            {
              tipo: parsed.value.tipo,
              categoria: parsed.value.categoria,
              cantidad: parsed.value.cantidad,
              texto_original: null,
              producto_id: null,
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
  const fotosDir = join(dirname(sqlitePath), "fotos");
  const db = openDb(sqlitePath, { fotosDir });
  const server = createServer({
    db,
    trustProxy: options.trustProxy ?? process.env.TRUST_PROXY === "1",
    whatsappNumber:
      options.whatsappNumber ?? process.env.WHATSAPP_PUBLIC_NUMBER ?? null,
    fotosDir,
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
