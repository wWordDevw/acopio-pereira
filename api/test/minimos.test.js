import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, listPuntos } from "../src/db.js";
import { estadoStock, minimoDe, MINIMO_POR_CATEGORIA } from "../src/minimos.js";
import { randomUUID } from "node:crypto";

describe("minimos", () => {
  it("cada categoría del catálogo tiene un piso", () => {
    for (const cat of ["agua","comida","medicinas","cobijas","ropa","higiene","ninos","mascotas","otro"]) {
      assert.ok(MINIMO_POR_CATEGORIA[cat] > 0, `falta ${cat}`);
    }
  });

  it("una categoría desconocida cae en el piso por defecto", () => {
    assert.equal(minimoDe("inventada"), 10);
  });

  it("el estado distingue agotado, bajo y ok", () => {
    assert.equal(estadoStock(0, 30), "agotado");
    assert.equal(estadoStock(30, 30), "bajo", "el umbral cuenta como bajo");
    assert.equal(estadoStock(31, 30), "ok");
  });

  it("un mínimo ausente no rompe el cálculo", () => {
    assert.equal(estadoStock(5, null), "bajo");
    assert.equal(estadoStock(50, undefined), "ok");
  });
});

describe("minimos en la base", () => {
  it("la semilla nace con el mínimo de su categoría y el inventario lo expone", () => {
    const dir = mkdtempSync(join(tmpdir(), "acopio-min-"));
    const db = openDb(join(dir, "t.sqlite"));
    try {
      const sinPiso = db
        .prepare("select count(*) as n from productos where minimo is null")
        .get().n;
      assert.equal(sinPiso, 0, "ningún producto puede quedar sin piso");

      const agua = db
        .prepare("select * from productos where categoria = 'agua' limit 1")
        .get();
      assert.equal(agua.minimo, MINIMO_POR_CATEGORIA.agua);

      const pid = randomUUID();
      db.prepare(
        "insert into puntos (id,nombre,nota,lat,lng,idempotency_key) values (?,?,?,?,?,?)",
      ).run(pid, "Acopio", "Acopio · Activo · GPS · Centro", 4.8, -75.7, randomUUID());
      const mov = (tipo, cantidad) =>
        db.prepare(
          "insert into movimientos (id,punto_id,tipo,categoria,cantidad,producto_id,idempotency_key) values (?,?,?,?,?,?,?)",
        ).run(randomUUID(), pid, tipo, "agua", cantidad, agua.id, randomUUID());
      mov("entra", 10);
      mov("sale", 10);

      // Agotado: la línea sigue en el inventario, en cero. Es la información
      // que le dice a alguien que este punto necesita agua.
      const inv = listPuntos(db).find((p) => p.id === pid).inventario;
      const linea = inv.find((i) => i.producto_id === agua.id);
      assert.equal(linea.stock, 0);
      assert.equal(linea.minimo, MINIMO_POR_CATEGORIA.agua);
      assert.ok(linea.movido_at, "la frescura por producto viaja con la línea");
      assert.equal(estadoStock(linea.stock, linea.minimo), "agotado");
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
