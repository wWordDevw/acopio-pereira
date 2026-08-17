import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchZona, ZONAS } from "../src/zonas.js";

describe("matchZona", () => {
  it("matches Cuba without accent logic", () => {
    const z = matchZona("cobijas en Cuba");
    assert.equal(z.id, "cuba");
    assert.ok(z.lat > 4.7 && z.lat < 5.05);
  });

  it("matches La Virginia with and without article", () => {
    assert.equal(matchZona("la virginia").id, "la-virginia");
    assert.equal(matchZona("Virginia").id, "la-virginia");
  });

  it("returns null when no barrio", () => {
    assert.equal(matchZona("dónde hay pañales"), null);
  });

  it("includes required barrios", () => {
    const ids = ZONAS.map((z) => z.id);
    for (const id of [
      "centro",
      "cuba",
      "boston",
      "el-poblado",
      "consota",
      "circunvalar",
      "dosquebradas",
      "la-virginia",
      "expofuturo",
      "utp",
      "alamos",
    ]) {
      assert.ok(ids.includes(id), id);
    }
  });
});
