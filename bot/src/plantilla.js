import { CATEGORIAS, ETIQUETAS } from "../../api/src/categorias.js";
import { ZONAS } from "./zonas.js";

export const PUBLIC_WEB = "https://insumos.vowtech.lat";

function etiqueta(categoria) {
  return ETIQUETAS[categoria] ?? categoria ?? "insumos";
}

function webBase(publicWeb) {
  return publicWeb ?? PUBLIC_WEB;
}

/** Appends `\n\n0 Menú` unless the trimmed text already ends with it. */
export function conPieMenu(text) {
  const body = String(text ?? "").replace(/\s+$/u, "");
  if (/(?:^|\n)0 Menú$/u.test(body)) return body;
  return `${body}\n\n0 Menú`;
}

export function textoMenuInicio() {
  const cats = CATEGORIAS.filter((c) => c !== "otro");
  const lineas = cats.map((c, i) => `${i + 1} ${etiqueta(c)}`);
  return (
    "Puedo decirte qué hay y a dónde ir.\n" +
    "Escribe el número o el insumo y el barrio (ej: cobijas en Cuba).\n" +
    "\n" +
    [...lineas, `${cats.length + 1} Mapa`, "0 Menú"].join("\n")
  );
}

export function textoAyuda() {
  return textoMenuInicio();
}

/** When media (audio/image/sticker) arrives — ask for text. */
export function textoPedirTexto() {
  return "Escríbeme qué necesitas. Ej: cobijas en Cuba.";
}

/** Missing category. */
export function textoPedirCategoria() {
  return "¿Qué buscas? Comida, medicinas, higiene, niños, cobijas, agua, ropa o mascotas.";
}

/** Near-me without zone. */
export function textoPedirZona() {
  return "¿En qué barrio o zona estás?";
}

/** Could not parse intent. */
export function textoNoEntendi() {
  return "Escríbeme el insumo y el barrio. Ej: cobijas en Cuba.";
}

/** Rate limited. */
export function textoRateLimit() {
  return conPieMenu("Demasiadas consultas. Prueba en un rato o mira el mapa.");
}

/** API down; include map link. */
export function textoApiCaida(publicWeb) {
  const base = webBase(publicWeb);
  return conPieMenu(`No pude consultar el inventario ahora. Mira el mapa: ${base}`);
}

export function textoMenuZona(categoria) {
  const etiq = etiqueta(categoria);
  return (
    `${etiq} — ¿dónde?\n` +
    "\n" +
    "1 Ver todos\n" +
    "2 Elegir barrio\n" +
    "0 Menú\n" +
    "\n" +
    "También puedes escribir el barrio (ej: Cuba)."
  );
}

export function textoMenuBarrios() {
  const lineas = ZONAS.map((z, i) => `${i + 1} ${z.nombre}`);
  return ["Elige el barrio:", "", ...lineas, "0 Menú"].join("\n");
}

export function textoMapa(publicWeb) {
  return conPieMenu(`Mira el mapa: ${webBase(publicWeb)}`);
}

/**
 * Inventory reply (max 3 puntos; caller slices).
 * @param {{
 *   categoria: string,
 *   zonaNombre?: string|null,
 *   puntos: Array<{
 *     id: string,
 *     nombre: string,
 *     lat: number,
 *     lng: number,
 *     inventario?: Array<{ categoria: string, stock: number }>,
 *   }>,
 *   publicWeb?: string,
 * }} opts
 */
export function textoRespuesta({ categoria, zonaNombre, puntos, publicWeb }) {
  const base = webBase(publicWeb);
  const etiq = etiqueta(categoria);
  const etiqLower = String(etiq).toLowerCase();
  const zona = zonaNombre ? String(zonaNombre).trim() : "";

  if (!puntos || puntos.length === 0) {
    const donde = zona ? ` en ${zona}` : "";
    return conPieMenu(`No hay ${etiq} registradas${donde}.\nMapa: ${base}`);
  }

  const header = zona
    ? `${etiq} cerca de ${zona}:`
    : `${etiq}:`;

  const lineas = puntos.slice(0, 3).map((p, i) => {
    const item = (p.inventario ?? []).find((x) => x.categoria === categoria);
    const stock = item?.stock ?? 0;
    const n = i + 1;
    return (
      `${n}. ${p.nombre} — ${stock} ${etiqLower}\n` +
      `Cómo llegar: https://www.google.com/maps?q=${p.lat},${p.lng}\n` +
      `Ficha: ${base}/punto.html?id=${p.id}`
    );
  });

  return conPieMenu([header, "", ...lineas].join("\n"));
}
