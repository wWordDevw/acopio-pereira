import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseVoz } from "../src/parse-voz.js";

describe("parseVoz", () => {
  it("parses quantity and cobijas", () => {
    const items = parseVoz("20 cobijas");
    assert.equal(items.length, 1);
    assert.equal(items[0].categoria, "cobijas");
    assert.equal(items[0].cantidad, 20);
  });

  it("parses two items joined by y", () => {
    const items = parseVoz("veinte cobijas y diez kits de aseo");
    assert.equal(items.length, 2);
    assert.equal(items[0].categoria, "cobijas");
    assert.equal(items[0].cantidad, 20);
    assert.equal(items[1].categoria, "higiene");
    assert.equal(items[1].cantidad, 10);
  });

  it("defaults quantity to 1 and unknown to otro", () => {
    const items = parseVoz("linternas");
    assert.equal(items.length, 1);
    assert.equal(items[0].categoria, "otro");
    assert.equal(items[0].cantidad, 1);
  });

  it("maps pañales to ninos", () => {
    const items = parseVoz("15 pañales");
    assert.equal(items[0].categoria, "ninos");
    assert.equal(items[0].cantidad, 15);
  });

  it("returns empty for blank", () => {
    assert.deepEqual(parseVoz("  "), []);
  });

  it("keeps treinta y cinco as 35", () => {
    const items = parseVoz("treinta y cinco cobijas");
    assert.equal(items.length, 1);
    assert.equal(items[0].cantidad, 35);
    assert.equal(items[0].categoria, "cobijas");
  });

  it("splits a long spoken list", () => {
    const items = parseVoz(
      "20 cobijas 15 pañales 10 kits de aseo y 8 aguas",
    );
    assert.equal(items.length, 4);
    assert.equal(items[0].categoria, "cobijas");
    assert.equal(items[0].cantidad, 20);
    assert.equal(items[1].categoria, "ninos");
    assert.equal(items[1].cantidad, 15);
    assert.equal(items[2].categoria, "higiene");
    assert.equal(items[2].cantidad, 10);
    assert.equal(items[3].categoria, "agua");
    assert.equal(items[3].cantidad, 8);
  });

  it("maps granos and panela to comida", () => {
    const items = parseVoz("30 granos y 12 panelas");
    assert.equal(items[0].categoria, "comida");
    assert.equal(items[0].cantidad, 30);
    assert.equal(items[1].categoria, "comida");
    assert.equal(items[1].cantidad, 12);
  });

  it("maps carpas and colchonetas to cobijas", () => {
    const items = parseVoz("8 carpas y 15 colchonetas");
    assert.equal(items[0].categoria, "cobijas");
    assert.equal(items[1].categoria, "cobijas");
  });

  it("maps insumos medicos and repelente", () => {
    const items = parseVoz("5 insumos medicos y 4 repelentes");
    assert.equal(items[0].categoria, "medicinas");
    assert.equal(items[1].categoria, "higiene");
  });

  it("keeps pet food as mascotas not comida", () => {
    const items = parseVoz("10 alimento para mascotas y 6 comida para perros");
    assert.equal(items[0].categoria, "mascotas");
    assert.equal(items[1].categoria, "mascotas");
  });
});
