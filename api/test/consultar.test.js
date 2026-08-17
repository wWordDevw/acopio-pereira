import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filtrarPuntos } from "../src/consultar.js";
import { consultarInventario, queryConsulta } from "../src/inventario.js";
import { openDb } from "../src/db.js";

const PUNTO_COMIDA_NOMBRADA = {
  id: "p-named",
  nombre: "Test 20 de Julio",
  lat: 4.814,
  lng: -75.682,
  inventario: [
    {
      categoria: "comida",
      producto_id: "ar-1",
      nombre: "Arroz",
      stock: 140,
    },
  ],
};

const PUNTO_COMIDA_LEGACY = {
  id: "p-legacy",
  nombre: "Acopio · Tatama",
  lat: 4.81,
  lng: -75.798,
  inventario: [
    { categoria: "comida", producto_id: null, nombre: null, stock: 5 },
    { categoria: "medicinas", producto_id: null, nombre: null, stock: 5 },
  ],
};

describe("filtrarPuntos", () => {
  it("includes points whose category stock has no producto_id", () => {
    const rows = filtrarPuntos(
      [PUNTO_COMIDA_NOMBRADA, PUNTO_COMIDA_LEGACY],
      {
        categoria: "comida",
        con_stock: true,
        lat: null,
        lng: null,
        radio: 5,
        limit: 200,
      },
    );
    assert.equal(rows.length, 2);
    assert.ok(rows.some((p) => p.id === "p-named"));
    assert.ok(rows.some((p) => p.id === "p-legacy"));
  });
});

const KEY = (n) =>
  `${String(n).padStart(8, "0")}-cccc-4ccc-8ccc-cccccccccccc`;

describe("consultarInventario", () => {
  let dir;
  let db;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "inv-"));
    db = openDb(join(dir, "t.sqlite"));
    db.prepare(
      `insert into puntos (id, nombre, nota, lat, lng, idempotency_key)
       values (?, ?, ?, ?, ?, ?)`,
    ).run("p-leg", "Acopio · Tatama", null, 4.81, -75.798, KEY(1));
    db.prepare(
      `insert into movimientos
        (id, punto_id, tipo, categoria, cantidad, texto_original, idempotency_key, producto_id)
       values (?, ?, 'entra', 'comida', 5, null, ?, null)`,
    ).run("m-leg", "p-leg", KEY(2));
  });

  after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads category stock from the database without HTTP", () => {
    const rows = consultarInventario(
      db,
      queryConsulta({ categoria: "comida" }),
    );
    const punto = rows.find((p) => p.id === "p-leg");
    assert.ok(punto, "expected Tatama from SQLite");
    assert.equal(
      punto.inventario.find((i) => i.categoria === "comida").stock,
      5,
    );
  });
});
