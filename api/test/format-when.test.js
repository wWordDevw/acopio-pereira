import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatWhen } from "../../public/js/categorias.js";

describe("formatWhen", () => {
  it("prints clock time for today, not hace X min", () => {
    const text = formatWhen(new Date().toISOString());
    assert.equal(/\bhace\b/.test(text), false);
    assert.equal(/\bahora\b/.test(text), false);
    assert.match(text, /^\d{2}[:.]\d{2}$/);
  });

  it("prints day and month for another calendar day", () => {
    const text = formatWhen("2026-08-16T18:12:00.000Z");
    assert.equal(/\bhace\b/.test(text), false);
    assert.match(text, /\d{1,2}\s+\w+\s+·\s+\d{2}[:.]\d{2}/);
  });
});
