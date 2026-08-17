import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, insertPunto, insertOrden, listOrdenes, listMovimientos, stockByPunto } from "../src/db.js";

const KEY = (n) =>
  `${String(n).padStart(8, "0")}-cccc-4ccc-8ccc-cccccccccccc`;

describe("ordenes db", () => {
  let dir;
  let db;
  let puntoId;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "ord-db-"));
    db = openDb(join(dir, "t.sqlite"), { fotosDir: join(dir, "fotos") });
    const p = insertPunto(db, {
      nombre: "Expofuturo",
      lat: 4.81,
      lng: -75.7,
      nota: null,
      idempotency_key: KEY(1),
    });
    puntoId = p.row.id;
  });

  after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("inserts an order and movements; stock matches loose moves", () => {
    const r = insertOrden(db, {
      puntoId,
      tipo: "entra",
      abierta_at: "2026-08-17T18:12:00.000Z",
      dia: "2026-08-17",
      nota: null,
      foto_path: null,
      idempotency_key: KEY(2),
      lineas: [
        { categoria: "ninos", cantidad: 20, producto_id: null },
        { categoria: "comida", cantidad: 10, producto_id: null },
        { categoria: "higiene", cantidad: 8, producto_id: null },
      ],
    });
    assert.equal(r.created, true);
    assert.equal(r.rows.length, 3);
    assert.ok(r.rows.every((m) => m.orden_id === r.orden.id));
    const stock = stockByPunto(db, puntoId);
    const ninos = stock.find((s) => s.categoria === "ninos");
    assert.equal(ninos.stock, 20);
    const listed = listOrdenes(db, puntoId, "2026-08-17");
    assert.equal(listed.length, 1);
    assert.equal(listed[0].unidades, 38);
    assert.equal(listed[0].lineas, 3);
    assert.equal(listOrdenes(db, puntoId, "2026-08-16").length, 0);
    const movs = listMovimientos(db, puntoId, 10);
    assert.equal(movs[0].orden_abierta_at, "2026-08-17T18:12:00.000Z");
  });

  it("replays the same idempotency key", () => {
    const a = insertOrden(db, {
      puntoId,
      tipo: "entra",
      abierta_at: "2026-08-17T19:00:00.000Z",
      dia: "2026-08-17",
      nota: null,
      foto_path: null,
      idempotency_key: KEY(3),
      lineas: [{ categoria: "agua", cantidad: 1, producto_id: null }],
    });
    const b = insertOrden(db, {
      puntoId,
      tipo: "entra",
      abierta_at: "2026-08-17T19:00:00.000Z",
      dia: "2026-08-17",
      nota: null,
      foto_path: null,
      idempotency_key: KEY(3),
      lineas: [{ categoria: "agua", cantidad: 1, producto_id: null }],
    });
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(b.orden.id, a.orden.id);
    const agua = stockByPunto(db, puntoId).find((s) => s.categoria === "agua");
    assert.equal(agua.stock, 1);
  });

  it("rolls back the whole order when a sale line has zero stock", () => {
    assert.throws(
      () =>
        insertOrden(db, {
          puntoId,
          tipo: "sale",
          abierta_at: "2026-08-17T20:00:00.000Z",
          dia: "2026-08-17",
          nota: null,
          foto_path: null,
          idempotency_key: KEY(4),
          lineas: [{ categoria: "ropa", cantidad: 2, producto_id: null }],
        }),
      (err) => err.message === "sin_stock" && err.status === 400,
    );
    assert.equal(listOrdenes(db, puntoId, "2026-08-17").length, 2);
  });
});
