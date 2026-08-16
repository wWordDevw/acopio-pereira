import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validatePunto, validateMovimiento } from "../src/validate.js";

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
  it("accepts a button tap", () => {
    const r = validateMovimiento({
      tipo: "entra",
      categoria: "agua",
      cantidad: 5,
      idempotency_key: KEY,
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.cantidad, 5);
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
