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
});
