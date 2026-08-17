import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  SEMILLA_PRODUCTOS,
  aliasesOf,
  slugNombre,
} from "./productos.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INIT_SQL = readFileSync(join(__dirname, "../sql/001_init.sql"), "utf8");
const PRODUCTOS_SQL = readFileSync(
  join(__dirname, "../sql/002_productos.sql"),
  "utf8",
);

function hasColumn(db, table, name) {
  return db
    .prepare(`pragma table_info(${table})`)
    .all()
    .some((c) => c.name === name);
}

function migrateProductos(db) {
  db.exec(PRODUCTOS_SQL);
  if (!hasColumn(db, "movimientos", "producto_id")) {
    db.exec(
      "alter table movimientos add column producto_id text references productos(id)",
    );
  }
}

function seedProductos(db) {
  const insert = db.prepare(
    `insert or ignore into productos (id, slug, nombre, categoria, aliases)
     values (?, ?, ?, ?, ?)`,
  );
  for (const item of SEMILLA_PRODUCTOS) {
    insert.run(
      randomUUID(),
      slugNombre(item.nombre),
      item.nombre,
      item.categoria,
      JSON.stringify(item.aliases || []),
    );
  }
}

export function openDb(path, options = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(INIT_SQL);
  migrateProductos(db);
  seedProductos(db);
  db.fotosDir = options.fotosDir || join(dirname(path), "fotos");
  mkdirSync(db.fotosDir, { recursive: true });
  return db;
}

export function findByIdempotency(db, table, key) {
  const allowed = { puntos: true, movimientos: true, productos: true };
  if (!allowed[table]) throw new Error("tabla_invalida");
  return db.prepare(`select * from ${table} where idempotency_key = ?`).get(key);
}

function isUniqueError(err) {
  return (
    err &&
    (err.code === "SQLITE_CONSTRAINT_UNIQUE" || err.code === "SQLITE_CONSTRAINT")
  );
}

export function insertPunto(db, row) {
  const existing = findByIdempotency(db, "puntos", row.idempotency_key);
  if (existing) return { created: false, row: existing };

  const id = row.id ?? randomUUID();
  try {
    db.prepare(
      `insert into puntos (id, nombre, nota, lat, lng, idempotency_key)
       values (?, ?, ?, ?, ?, ?)`,
    ).run(id, row.nombre, row.nota, row.lat, row.lng, row.idempotency_key);
  } catch (err) {
    if (isUniqueError(err)) {
      return {
        created: false,
        row: findByIdempotency(db, "puntos", row.idempotency_key),
      };
    }
    throw err;
  }
  return {
    created: true,
    row: db.prepare("select * from puntos where id = ?").get(id),
  };
}

export function getPunto(db, id) {
  return db.prepare("select * from puntos where id = ?").get(id);
}

export function stockByPunto(db, puntoId) {
  return db
    .prepare(
      `select m.categoria,
              m.producto_id,
              p.nombre as nombre,
              p.slug as slug,
              p.foto_path as foto_path,
              coalesce(sum(case when m.tipo = 'entra' then m.cantidad else 0 end), 0)
            - coalesce(sum(case when m.tipo = 'sale' then m.cantidad else 0 end), 0)
              as stock
       from movimientos m
       left join productos p on p.id = m.producto_id
       where m.punto_id = ?
       group by m.categoria, m.producto_id
       having stock > 0
       order by m.categoria, nombre`,
    )
    .all(puntoId);
}

export function stockOf(db, puntoId, categoria, productoId = null) {
  const row = productoId
    ? db
        .prepare(
          `select
             coalesce(sum(case when tipo = 'entra' then cantidad else 0 end), 0)
           - coalesce(sum(case when tipo = 'sale' then cantidad else 0 end), 0)
             as stock
           from movimientos
           where punto_id = ? and producto_id = ?`,
        )
        .get(puntoId, productoId)
    : db
        .prepare(
          `select
             coalesce(sum(case when tipo = 'entra' then cantidad else 0 end), 0)
           - coalesce(sum(case when tipo = 'sale' then cantidad else 0 end), 0)
             as stock
           from movimientos
           where punto_id = ? and categoria = ? and producto_id is null`,
        )
        .get(puntoId, categoria);
  return row ? row.stock : 0;
}

export function listPuntos(db) {
  const puntos = db
    .prepare("select * from puntos order by updated_at desc")
    .all();
  const stocks = db
    .prepare(
      `select punto_id, categoria,
              coalesce(sum(case when tipo = 'entra' then cantidad else 0 end), 0)
            - coalesce(sum(case when tipo = 'sale' then cantidad else 0 end), 0)
              as stock
       from movimientos
       group by punto_id, categoria
       having stock > 0`
    )
    .all();
  const byPunto = new Map();
  for (const s of stocks) {
    if (!byPunto.has(s.punto_id)) byPunto.set(s.punto_id, []);
    byPunto.get(s.punto_id).push({
      categoria: s.categoria,
      stock: s.stock,
    });
  }
  return puntos.map((p) => ({
    ...p,
    inventario: byPunto.get(p.id) || [],
  }));
}

export function listMovimientos(db, puntoId, limit = 30) {
  return db
    .prepare(
      `select * from movimientos
       where punto_id = ?
       order by created_at desc, id desc
       limit ?`,
    )
    .all(puntoId, limit);
}

export function insertMovimientos(db, { puntoId, items, idempotency_key }) {
  const existing = findByIdempotency(db, "movimientos", idempotency_key);
  if (existing) {
    return {
      created: false,
      rows: listMovimientos(db, puntoId, 30),
      replay: true,
    };
  }

  return db.transaction(() => {
    const rows = [];
    let firstKey = idempotency_key;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      let cantidad = item.cantidad;
      let ajustado = false;
      if (item.tipo === "sale") {
        const disponible = stockOf(
          db,
          puntoId,
          item.categoria,
          item.producto_id || null,
        );
        if (disponible <= 0) {
          const err = new Error("sin_stock");
          err.status = 400;
          throw err;
        }
        if (cantidad > disponible) {
          cantidad = disponible;
          ajustado = true;
        }
      }
      const id = randomUUID();
      const key = i === 0 ? firstKey : `${firstKey}:${i}`;
      db.prepare(
        `insert into movimientos (
          id, punto_id, tipo, categoria, cantidad, texto_original, idempotency_key, producto_id
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        puntoId,
        item.tipo,
        item.categoria,
        cantidad,
        item.texto_original ?? null,
        key,
        item.producto_id ?? null,
      );
      rows.push({
        ...db.prepare("select * from movimientos where id = ?").get(id),
        ajustado,
      });
    }
    db.prepare(
      "update puntos set updated_at = datetime('now') where id = ?",
    ).run(puntoId);
    return { created: true, rows, replay: false };
  })();
}

export function listProductos(db, { categoria, q } = {}) {
  let rows = db
    .prepare("select * from productos order by categoria, nombre")
    .all();
  if (categoria) rows = rows.filter((r) => r.categoria === categoria);
  if (q) {
    const needle = q.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    rows = rows.filter((r) => {
      const blob = `${r.nombre} ${r.slug} ${r.aliases}`.toLowerCase();
      return blob.includes(needle) || foldHay(r, needle);
    });
  }
  return rows;
}

function foldHay(row, needle) {
  const keys = [row.slug, row.nombre, ...aliasesOf(row)].map((s) =>
    String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, ""),
  );
  return keys.some((k) => k.includes(needle));
}

export function getProducto(db, id) {
  return db.prepare("select * from productos where id = ?").get(id);
}

export function getProductoBySlug(db, slug) {
  return db.prepare("select * from productos where slug = ?").get(slug);
}

export function insertProducto(db, { nombre, categoria, aliases = [] }) {
  const slug = slugNombre(nombre);
  const existing = getProductoBySlug(db, slug);
  if (existing) return { created: false, row: existing };
  const id = randomUUID();
  try {
    db.prepare(
      `insert into productos (id, slug, nombre, categoria, aliases)
       values (?, ?, ?, ?, ?)`,
    ).run(id, slug, nombre, categoria, JSON.stringify(aliases));
  } catch (err) {
    if (isUniqueError(err)) {
      return { created: false, row: getProductoBySlug(db, slug) };
    }
    throw err;
  }
  return {
    created: true,
    row: getProducto(db, id),
  };
}

export function setProductoFoto(db, id, fotoPath) {
  db.prepare("update productos set foto_path = ? where id = ?").run(
    fotoPath,
    id,
  );
  return getProducto(db, id);
}

export function hitRateLimit(db, clave, { windowMs, limit }, now = Date.now()) {
  return db.transaction(() => {
    const row = db
      .prepare("select clave, ventana, conteo from rate_limits where clave = ?")
      .get(clave);

    if (!row) {
      db.prepare(
        "insert into rate_limits (clave, ventana, conteo) values (?, ?, 1)",
      ).run(clave, String(now));
      return { limited: false, conteo: 1 };
    }

    const start = Number(row.ventana);
    if (now - start >= windowMs) {
      db.prepare(
        "update rate_limits set ventana = ?, conteo = 1 where clave = ?",
      ).run(String(now), clave);
      return { limited: false, conteo: 1 };
    }

    if (row.conteo >= limit) {
      return { limited: true, conteo: row.conteo };
    }

    db.prepare("update rate_limits set conteo = conteo + 1 where clave = ?").run(
      clave,
    );
    return { limited: false, conteo: row.conteo + 1 };
  })();
}
