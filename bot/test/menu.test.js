import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ZONAS } from "../src/zonas.js";
import {
  MENU_CATEGORIAS,
  parseMenuNumber,
  isMenuHomeTrigger,
  resolveMenu,
} from "../src/menu.js";

describe("menu", () => {
  it("MENU_CATEGORIAS is eight slugs without otro", () => {
    assert.deepEqual(MENU_CATEGORIAS, [
      "comida",
      "medicinas",
      "higiene",
      "ninos",
      "cobijas",
      "agua",
      "ropa",
      "mascotas",
    ]);
  });

  it("parseMenuNumber accepts only whole digit strings", () => {
    assert.equal(parseMenuNumber("5"), 5);
    assert.equal(parseMenuNumber(" 09 "), 9);
    assert.equal(parseMenuNumber("0"), 0);
    assert.equal(parseMenuNumber("2."), 2);
    assert.equal(parseMenuNumber("1a"), null);
    assert.equal(parseMenuNumber("hola"), null);
    assert.equal(parseMenuNumber(""), null);
  });

  it("home triggers include 0, menu with accent, and hola", () => {
    assert.equal(isMenuHomeTrigger("0"), true);
    assert.equal(isMenuHomeTrigger("Menú"), true);
    assert.equal(isMenuHomeTrigger("hola"), true);
    assert.equal(isMenuHomeTrigger("5"), false);
    assert.equal(isMenuHomeTrigger("cobijas"), false);
  });

  it("inicio 5 goes to zona cobijas", () => {
    const r = resolveMenu({ pantalla: "inicio", n: 5, categoria: null });
    assert.equal(r.kind, "show");
    assert.equal(r.next, "zona");
    assert.equal(r.categoria, "cobijas");
    assert.match(r.text, /🛏️ Cobijas — ¿dónde\?/);
  });

  it("inicio 9 stays on inicio with mapa", () => {
    const r = resolveMenu({
      pantalla: "inicio",
      n: 9,
      categoria: null,
      publicWeb: "https://insumos.vowtech.lat",
    });
    assert.equal(r.kind, "stay");
    assert.equal(r.next, "inicio");
    assert.match(r.text, /insumos\.vowtech\.lat/);
  });

  it("inicio 99 re-shows inicio", () => {
    const r = resolveMenu({ pantalla: "inicio", n: 99, categoria: null });
    assert.equal(r.kind, "show");
    assert.equal(r.next, "inicio");
    assert.match(r.text, /^1\. 🍚 Comida$/m);
  });

  it("zona 1 consults without zone", () => {
    const r = resolveMenu({ pantalla: "zona", n: 1, categoria: "cobijas" });
    assert.equal(r.kind, "consultar");
    assert.equal(r.next, "resultados");
    assert.equal(r.categoria, "cobijas");
    assert.equal(r.zona, null);
  });

  it("zona 2 lists barrios", () => {
    const r = resolveMenu({ pantalla: "zona", n: 2, categoria: "cobijas" });
    assert.equal(r.kind, "show");
    assert.equal(r.next, "barrios");
    assert.match(r.text, /2\. Cuba/);
  });

  it("zona 3 asks to list acopios", () => {
    const r = resolveMenu({ pantalla: "zona", n: 3, categoria: "medicinas" });
    assert.equal(r.kind, "listar_acopios");
    assert.equal(r.next, "acopios");
    assert.equal(r.categoria, "medicinas");
  });

  it("acopios 1 is the first listed point", () => {
    const r = resolveMenu({
      pantalla: "acopios",
      n: 1,
      categoria: "medicinas",
      acopios: [
        { id: "tat", nombre: "Acopio · Tatama" },
        { id: "utp", nombre: "Acopio · UTP" },
      ],
    });
    assert.equal(r.kind, "consultar_punto");
    assert.equal(r.punto.id, "tat");
    assert.equal(r.categoria, "medicinas");
  });

  it("barrios 2 is Cuba", () => {
    const r = resolveMenu({ pantalla: "barrios", n: 2, categoria: "cobijas" });
    assert.equal(r.kind, "consultar");
    assert.equal(r.zona.id, "cuba");
    assert.equal(r.zona.nombre, ZONAS[1].nombre);
    assert.equal(r.zona.lat, ZONAS[1].lat);
    assert.equal(r.categoria, "cobijas");
  });

  it("0 from any screen returns inicio", () => {
    const r = resolveMenu({ pantalla: "barrios", n: 0, categoria: "agua" });
    assert.equal(r.next, "inicio");
    assert.equal(r.categoria, null);
    assert.match(r.text, /^1\. 🍚 Comida$/m);
  });
});
