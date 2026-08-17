import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validatePunto,
  validateMovimiento,
  validateConsulta,
  validateOrden,
  validateDia,
} from "../src/validate.js";

const KEY = "11111111-1111-1111-1111-111111111111";

describe("validatePunto", () => {
  it("accepts a Pereira coordinate", () => {
    const r = validatePunto({
      nombre: "  Iglesia Cuba  ",
      lat: 4.8133,
      lng: -75.6961,
      idempotency_key: KEY,
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.nombre, "Iglesia Cuba");
    assert.equal(r.value.nota, null);
  });

  it("rejects Bogotá", () => {
    const r = validatePunto({
      nombre: "Parque 93",
      lat: 4.676,
      lng: -74.048,
      idempotency_key: KEY,
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, "fuera_de_zona");
  });

  it("rejects URL in nombre", () => {
    const r = validatePunto({
      nombre: "mira https://x.com",
      lat: 4.81,
      lng: -75.69,
      idempotency_key: KEY,
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, "url_no_permitida");
  });
});

describe("validateMovimiento", () => {
  it("accepts a product button tap", () => {
    const r = validateMovimiento({
      tipo: "entra",
      producto_id: KEY,
      cantidad: 5,
      idempotency_key: KEY,
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.cantidad, 5);
    assert.equal(r.value.producto_id, KEY);
  });

  it("rejects a category tap without product", () => {
    const r = validateMovimiento({
      tipo: "entra",
      categoria: "agua",
      cantidad: 5,
      idempotency_key: KEY,
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, "producto_requerido");
  });

  it("accepts voice text", () => {
    const r = validateMovimiento({
      tipo: "sale",
      texto: "20 cobijas",
      idempotency_key: KEY,
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.texto, "20 cobijas");
  });

  it("rejects bad tipo", () => {
    const r = validateMovimiento({
      tipo: "mover",
      categoria: "agua",
      idempotency_key: KEY,
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, "tipo_invalido");
  });
});

describe("validateConsulta", () => {
  it("treats q=cobijas as categoria", () => {
    const r = validateConsulta({ q: "Cobijas" });
    assert.equal(r.ok, true);
    assert.equal(r.value.categoria, "cobijas");
    assert.equal(r.value.q, null);
    assert.equal(r.value.con_stock, true);
  });

  it("keeps a place name as q", () => {
    const r = validateConsulta({ q: "Cuba" });
    assert.equal(r.ok, true);
    assert.equal(r.value.q, "Cuba");
    assert.equal(r.value.categoria, null);
  });

  it("rejects a bad categoria", () => {
    const r = validateConsulta({ categoria: "piedras" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "categoria_invalida");
  });

  it("requires lat and lng together", () => {
    const r = validateConsulta({ lat: "4.81" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "coordenada_invalida");
  });
});

describe("validateOrden", () => {
  const base = {
    tipo: "entra",
    abierta_at: "2026-08-17T18:12:00.000Z",
    dia: "2026-08-17",
    lineas: [{ categoria: "agua", cantidad: 2 }],
    idempotency_key: KEY,
  };

  it("accepts a three-line entra", () => {
    const r = validateOrden({
      ...base,
      lineas: [
        { categoria: "ninos", cantidad: 20 },
        { categoria: "comida", cantidad: 10 },
        { categoria: "higiene", cantidad: 8 },
      ],
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.lineas.length, 3);
    assert.equal(r.value.dia, "2026-08-17");
  });

  it("rejects empty lineas", () => {
    const r = validateOrden({ ...base, lineas: [] });
    assert.equal(r.ok, false);
    assert.equal(r.error, "items_invalidos");
  });

  it("rejects bad tipo", () => {
    const r = validateOrden({ ...base, tipo: "mover" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "tipo_invalido");
  });

  it("rejects bad dia", () => {
    const r = validateOrden({ ...base, dia: "17/08/2026" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "dia_invalido");
  });

  it("rejects unparseable abierta_at", () => {
    const r = validateOrden({ ...base, abierta_at: "ayer" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "fecha_invalida");
  });
});

describe("validateDia", () => {
  it("accepts YYYY-MM-DD", () => {
    assert.equal(validateDia("2026-08-17").value, "2026-08-17");
  });
  it("rejects slashes", () => {
    assert.equal(validateDia("2026/08/17").ok, false);
  });
});
