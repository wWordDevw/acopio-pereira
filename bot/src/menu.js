import { CATEGORIAS } from "../../api/src/categorias.js";
import { ZONAS } from "./zonas.js";
import {
  textoMenuInicio,
  textoMenuZona,
  textoMenuBarrios,
  textoMapa,
} from "./plantilla.js";

export const MENU_CATEGORIAS = CATEGORIAS.filter((c) => c !== "otro");

function fold(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

export function parseMenuNumber(text) {
  const t = String(text ?? "").trim();
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

const HOME = new Set(["0", "menu", "hola", "hi", "buenas", "ayuda", "start"]);

export function isMenuHomeTrigger(text) {
  return HOME.has(fold(text));
}

function zonaPublica(z) {
  return {
    id: z.id,
    nombre: z.nombre,
    lat: z.lat,
    lng: z.lng,
    radioKm: z.radioKm,
  };
}

/**
 * @param {{
 *   pantalla: string,
 *   n: number,
 *   categoria?: string|null,
 *   publicWeb?: string,
 * }} opts
 */
export function resolveMenu({ pantalla, n, categoria = null, publicWeb }) {
  if (n === 0) {
    return {
      kind: "show",
      next: "inicio",
      categoria: null,
      zona: null,
      text: textoMenuInicio(),
    };
  }
  if (pantalla === "inicio") {
    if (n >= 1 && n <= MENU_CATEGORIAS.length) {
      const cat = MENU_CATEGORIAS[n - 1];
      return {
        kind: "show",
        next: "zona",
        categoria: cat,
        zona: null,
        text: textoMenuZona(cat),
      };
    }
    if (n === MENU_CATEGORIAS.length + 1) {
      return {
        kind: "stay",
        next: "inicio",
        categoria: null,
        zona: null,
        text: textoMapa(publicWeb),
      };
    }
    return {
      kind: "show",
      next: "inicio",
      categoria: null,
      zona: null,
      text: textoMenuInicio(),
    };
  }
  if (pantalla === "zona") {
    if (n === 1) {
      return {
        kind: "consultar",
        next: "resultados",
        categoria,
        zona: null,
        text: null,
      };
    }
    if (n === 2) {
      return {
        kind: "show",
        next: "barrios",
        categoria,
        zona: null,
        text: textoMenuBarrios(),
      };
    }
    return {
      kind: "show",
      next: "zona",
      categoria,
      zona: null,
      text: textoMenuZona(categoria),
    };
  }
  if (pantalla === "barrios") {
    if (n >= 1 && n <= ZONAS.length) {
      return {
        kind: "consultar",
        next: "resultados",
        categoria,
        zona: zonaPublica(ZONAS[n - 1]),
        text: null,
      };
    }
    return {
      kind: "show",
      next: "barrios",
      categoria,
      zona: null,
      text: textoMenuBarrios(),
    };
  }
  return {
    kind: "show",
    next: "inicio",
    categoria: null,
    zona: null,
    text: textoMenuInicio(),
  };
}
