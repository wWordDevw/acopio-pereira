import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  textoAyuda,
  textoPedirTexto,
  textoRespuesta,
} from "../src/plantilla.js";

describe("plantilla", () => {
  it("ayuda includes the example", () => {
    assert.match(textoAyuda(), /cobijas en Cuba/);
  });

  it("asks for text when media arrives", () => {
    assert.match(textoPedirTexto(), /Escríbeme qué necesitas/);
  });

  it("zero stock points to the map", () => {
    const t = textoRespuesta({
      categoria: "cobijas",
      zonaNombre: "Cuba",
      puntos: [],
      publicWeb: "https://insumos.vowtech.lat",
    });
    assert.match(t, /No hay/i);
    assert.match(t, /Cuba/);
    assert.match(t, /insumos\.vowtech\.lat/);
  });

  it("one point has maps and ficha links", () => {
    const t = textoRespuesta({
      categoria: "cobijas",
      zonaNombre: "Cuba",
      publicWeb: "https://insumos.vowtech.lat",
      puntos: [
        {
          id: "abc",
          nombre: "Albergue X",
          lat: 4.8,
          lng: -75.7,
          inventario: [{ categoria: "cobijas", stock: 40 }],
        },
      ],
    });
    assert.match(t, /Albergue X — 40/);
    assert.match(t, /google\.com\/maps\?q=4\.8,-75\.7/);
    assert.match(t, /punto\.html\?id=abc/);
  });
});
