import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarResultados,
  entregarUnaVez,
  unirDictado,
} from "../../public/js/voz.js";

function result(transcript, isFinal) {
  return { 0: { transcript }, isFinal };
}

describe("aplicarResultados", () => {
  it("no vuelve a pegar el mismo final si Chrome lo reentrega", () => {
    const finals = [];
    aplicarResultados(finals, [result("20 cobijas", true)], 0);
    aplicarResultados(finals, [result("20 cobijas", true)], 0);
    assert.deepEqual(finals, ["20 cobijas"]);
    assert.equal(unirDictado(finals, ""), "20 cobijas");
  });

  it("tras un reinicio con resultIndex 0 solo suma lo nuevo", () => {
    const finals = [];
    aplicarResultados(finals, [result("20 cobijas", true)], 0);
    aplicarResultados(
      finals,
      [result("20 cobijas", true), result("10 aguas", true)],
      0,
    );
    assert.deepEqual(finals, ["20 cobijas", "10 aguas"]);
    assert.equal(unirDictado(finals, "y jabón"), "20 cobijas 10 aguas y jabón");
  });
});

describe("entregarUnaVez", () => {
  it("no llama onReady dos veces si onend y stop coinciden", () => {
    const seen = [];
    const ready = entregarUnaVez((text) => seen.push(text));
    ready("20 cobijas");
    ready("20 cobijas 20 cobijas");
    assert.deepEqual(seen, ["20 cobijas"]);
  });
});
