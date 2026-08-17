import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ZONAS } from "../src/zonas.js";
import {
  textoAyuda,
  textoPedirTexto,
  textoRespuesta,
  textoMenuInicio,
  textoMenuZona,
  textoMenuBarrios,
  textoMapa,
  textoRateLimit,
  textoApiCaida,
  conPieMenu,
} from "../src/plantilla.js";

describe("plantilla", () => {
  it("ayuda includes the example", () => {
    assert.match(textoAyuda(), /cobijas en Cuba/);
  });

  it("ayuda is the numbered start menu", () => {
    const t = textoAyuda();
    assert.equal(t, textoMenuInicio());
    assert.match(t, /^1 Comida$/m);
    assert.match(t, /^2 Medicinas$/m);
    assert.match(t, /^3 Higiene$/m);
    assert.match(t, /^4 Niños$/m);
    assert.match(t, /^5 Cobijas$/m);
    assert.match(t, /^6 Agua$/m);
    assert.match(t, /^7 Ropa$/m);
    assert.match(t, /^8 Mascotas$/m);
    assert.match(t, /^9 Mapa$/m);
    assert.match(t, /^0 Menú$/m);
    assert.doesNotMatch(t, /otro/i);
  });

  it("asks for text when media arrives", () => {
    assert.match(textoPedirTexto(), /Escríbeme qué necesitas/);
  });

  it("zero stock points to the map and menu footer", () => {
    const t = textoRespuesta({
      categoria: "cobijas",
      zonaNombre: "Cuba",
      puntos: [],
      publicWeb: "https://insumos.vowtech.lat",
    });
    assert.match(t, /No hay/i);
    assert.match(t, /Cuba/);
    assert.match(t, /insumos\.vowtech\.lat/);
    assert.match(t, /\n\n0 Menú$/);
  });

  it("one point has maps and ficha links and menu footer", () => {
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
    assert.match(t, /\n\n0 Menú$/);
  });

  it("zona menu names the category", () => {
    const t = textoMenuZona("cobijas");
    assert.match(t, /Cobijas — ¿dónde\?/);
    assert.match(t, /^1 Ver todos$/m);
    assert.match(t, /^2 Elegir barrio$/m);
    assert.match(t, /escribir el barrio/i);
    assert.match(t, /^0 Menú$/m);
  });

  it("barrios menu lists every ZONAS name in order", () => {
    const t = textoMenuBarrios();
    for (const [i, z] of ZONAS.entries()) {
      assert.match(t, new RegExp(`^${i + 1} ${z.nombre}$`, "m"));
    }
    assert.match(t, /^0 Menú$/m);
  });

  it("mapa includes public web and footer", () => {
    const t = textoMapa("https://insumos.vowtech.lat");
    assert.match(t, /insumos\.vowtech\.lat/);
    assert.match(t, /\n\n0 Menú$/);
  });

  it("rate limit and api down include menu footer", () => {
    assert.match(textoRateLimit(), /\n\n0 Menú$/);
    assert.match(textoApiCaida("https://insumos.vowtech.lat"), /\n\n0 Menú$/);
    assert.match(textoApiCaida("https://insumos.vowtech.lat"), /insumos\.vowtech\.lat/);
  });

  it("conPieMenu is idempotent", () => {
    assert.equal(conPieMenu("Hola\n\n0 Menú"), "Hola\n\n0 Menú");
    assert.equal(conPieMenu("Hola"), "Hola\n\n0 Menú");
  });
});
