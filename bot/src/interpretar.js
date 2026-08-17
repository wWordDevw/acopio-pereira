import { parseVoz } from "../../api/src/parse-voz.js";
import { categoriaDesdeTexto, CATEGORIAS } from "../../api/src/categorias.js";
import { matchZona } from "./zonas.js";

const AYUDA = new Set(["hola", "hi", "buenas", "ayuda", "menu", "start"]);

/** Fold to lowercase ASCII (NFD + strip marks). */
function fold(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * Rule-based intent parse for WhatsApp consult messages.
 * @param {string} texto
 * @returns {{
 *   categoria: string|null,
 *   zona: ReturnType<typeof matchZona>,
 *   zonaTexto: string|null,
 *   intencion: "consultar"|"ayuda"|"otro",
 *   necesitaCategoria: boolean,
 *   necesitaZona: boolean,
 * }}
 */
export function interpretar(texto) {
  const raw = String(texto ?? "").trim();
  if (!raw) {
    return {
      categoria: null,
      zona: null,
      zonaTexto: null,
      intencion: "otro",
      necesitaCategoria: true,
      necesitaZona: false,
    };
  }

  const folded = fold(raw);

  if (AYUDA.has(folded)) {
    return {
      categoria: null,
      zona: null,
      zonaTexto: null,
      intencion: "ayuda",
      necesitaCategoria: false,
      necesitaZona: false,
    };
  }

  const items = parseVoz(raw);
  let categoria = null;
  for (const item of items) {
    if (item.categoria !== "otro" && CATEGORIAS.includes(item.categoria)) {
      categoria = item.categoria;
      break;
    }
  }
  if (categoria == null) {
    categoria = categoriaDesdeTexto(raw);
  }

  const zona = matchZona(raw);

  let necesitaZona = false;
  if (zona == null && (/\bcerca\b/.test(folded) || /\bcercano[as]?\b/.test(folded))) {
    necesitaZona = true;
  }

  const intencion =
    categoria != null || zona != null || necesitaZona ? "consultar" : "otro";

  return {
    categoria,
    zona,
    zonaTexto: zona ? zona.nombre : null,
    intencion,
    necesitaCategoria: intencion === "consultar" && categoria == null,
    necesitaZona,
  };
}
