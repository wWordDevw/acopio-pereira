import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, openDbReadOnly } from "../../api/src/db.js";
import { createConsultar } from "../src/consultar.js";

const KEY = (n) =>
  `${String(n).padStart(8, "0")}-dddd-4ddd-8ddd-dddddddddddd`;

describe("createConsultar", () => {
  let dir;
  let writer;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "bot-inv-"));
    writer = openDb(join(dir, "t.sqlite"));
    writer
      .prepare(
        `insert into puntos (id, nombre, nota, lat, lng, idempotency_key)
         values (?, ?, ?, ?, ?, ?)`,
      )
      .run("p-leg", "Acopio · Tatama", null, 4.81, -75.798, KEY(1));
    writer
      .prepare(
        `insert into movimientos
          (id, punto_id, tipo, categoria, cantidad, texto_original, idempotency_key, producto_id)
         values (?, ?, 'entra', 'comida', 5, null, ?, null)`,
      )
      .run("m-leg", "p-leg", KEY(2));
  });

  after(() => {
    writer.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads the same SQLite file as the API, no HTTP", async () => {
    const reader = openDbReadOnly(join(dir, "t.sqlite"));
    try {
      const consultar = createConsultar(reader);
      const rows = await consultar({ categoria: "comida", zona: null });
      const punto = rows.find((p) => p.id === "p-leg");
      assert.ok(punto);
      assert.equal(
        punto.inventario.find((i) => i.categoria === "comida").stock,
        5,
      );
    } finally {
      reader.close();
    }
  });
});
