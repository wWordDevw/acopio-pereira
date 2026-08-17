import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { interpretar } from "../src/interpretar.js";

describe("interpretar", () => {
  it("maps pañales to ninos", () => {
    const r = interpretar("dónde hay pañales");
    assert.equal(r.categoria, "ninos");
    assert.equal(r.intencion, "consultar");
    assert.equal(r.necesitaCategoria, false);
  });

  it("gets cobijas and Cuba", () => {
    const r = interpretar("cobijas en Cuba");
    assert.equal(r.categoria, "cobijas");
    assert.equal(r.zona.id, "cuba");
    assert.equal(r.necesitaZona, false);
  });

  it("asks zona when they say cerca", () => {
    const r = interpretar("necesito agua cerca");
    assert.equal(r.categoria, "agua");
    assert.equal(r.necesitaZona, true);
    assert.equal(r.zona, null);
  });

  it("ayuda on hola", () => {
    const r = interpretar("hola");
    assert.equal(r.intencion, "ayuda");
  });

  it("ayuda on 0 and menú", () => {
    assert.equal(interpretar("0").intencion, "ayuda");
    assert.equal(interpretar("menú").intencion, "ayuda");
  });
});
