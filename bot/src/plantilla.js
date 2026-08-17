import { CATEGORIAS, ETIQUETAS } from "../../api/src/categorias.js";
import { ZONAS } from "./zonas.js";

export const PUBLIC_WEB = "https://insumos.vowtech.lat";

const EMOJI = {
  comida: "🍚",
  medicinas: "💊",
  higiene: "🧼",
  ninos: "👶",
  cobijas: "🛏️",
  agua: "💧",
  ropa: "👕",
  mascotas: "🐾",
};

function etiqueta(categoria) {
  return ETIQUETAS[categoria] ?? categoria ?? "insumos";
}

function etiquetaConEmoji(categoria) {
  const etiq = etiqueta(categoria);
  const emoji = EMOJI[categoria];
  return emoji ? `${emoji} ${etiq}` : etiq;
}

function webBase(publicWeb) {
  return publicWeb ?? PUBLIC_WEB;
}

/** Appends `\n\n0. Menú` unless the trimmed text already ends with it. */
export function conPieMenu(text) {
  const body = String(text ?? "").replace(/\s+$/u, "");
  if (/(?:^|\n)0\. Menú$/u.test(body)) return body;
  return `${body}\n\n0. Menú`;
}

export function textoMenuInicio() {
  const cats = CATEGORIAS.filter((c) => c !== "otro");
  const lineas = cats.map((c, i) => `${i + 1}. ${etiquetaConEmoji(c)}`);
  return (
    "Puedo decirte qué hay y a dónde ir.\n" +
    "Escribe el número o el insumo y el barrio (ej: cobijas en Cuba).\n" +
    "\n" +
    [...lineas, `${cats.length + 1}. 🗺️ Mapa`, "0. Menú"].join("\n")
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
  return (
    "¿Qué buscas?\n" +
    "🍚 comida · 💊 medicinas · 🧼 higiene · 👶 niños · 🛏️ cobijas · 💧 agua · 👕 ropa · 🐾 mascotas"
  );
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
  return (
    `${etiquetaConEmoji(categoria)} — ¿dónde?\n` +
    "\n" +
    "1. Ver todos\n" +
    "2. Elegir barrio\n" +
    "3. Elegir acopio\n" +
    "0. Menú\n" +
    "\n" +
    "También puedes escribir el barrio (ej: Cuba)."
  );
}

export function textoMenuBarrios() {
  const lineas = ZONAS.map((z, i) => `${i + 1}. ${z.nombre}`);
  return ["Elige el barrio:", "", ...lineas, "0. Menú"].join("\n");
}

export function textoMenuAcopios(acopios, categoria) {
  const etiq = etiqueta(categoria);
  const rows = acopios ?? [];
  if (rows.length === 0) {
    return (
      `No hay acopios con ${etiq}.\n` +
      "\n" +
      "1. Ver todos\n" +
      "2. Elegir barrio\n" +
      "0. Menú"
    );
  }
  const lineas = rows.map((p, i) => `${i + 1}. ${p.nombre}`);
  return ["Elige el acopio:", "", ...lineas, "0. Menú"].join("\n");
}

export function textoMapa(publicWeb) {
  return conPieMenu(`Mira el mapa: ${webBase(publicWeb)}`);
}

function itemsNombrados(inventario, categoria) {
  return (inventario ?? []).filter(
    (x) =>
      x.categoria === categoria &&
      x.producto_id &&
      (Number(x.stock) || 0) > 0,
  );
}

function itemsDeCategoria(inventario, categoria) {
  const nombrados = itemsNombrados(inventario, categoria);
  if (nombrados.length > 0) return nombrados;
  return (inventario ?? []).filter(
    (x) => x.categoria === categoria && (Number(x.stock) || 0) > 0,
  );
}

function nombreInsumo(item, categoria) {
  return item.nombre || item.etiqueta || etiqueta(categoria);
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
 *     inventario?: Array<{
 *       categoria: string,
 *       stock: number,
 *       nombre?: string|null,
 *       etiqueta?: string|null,
 *       producto_id?: string|null,
 *     }>,
 *   }>,
 *   publicWeb?: string,
 * }} opts
 */
export function textoRespuesta({ categoria, zonaNombre, puntos, publicWeb }) {
  const base = webBase(publicWeb);
  const etiq = etiqueta(categoria);
  const zona = zonaNombre ? String(zonaNombre).trim() : "";
  const visibles = (puntos ?? [])
    .map((p) => ({
      ...p,
      items: itemsDeCategoria(p.inventario, categoria).sort(
        (a, b) => (Number(b.stock) || 0) - (Number(a.stock) || 0),
      ),
    }))
    .filter((p) => p.items.length > 0)
    .slice(0, 3);

  if (visibles.length === 0) {
    const donde = zona ? ` en ${zona}` : "";
    return conPieMenu(`No hay ${etiq} registradas${donde}.\nMapa: ${base}`);
  }

  const header = zona
    ? `${etiq} cerca de ${zona}:`
    : `${etiq}:`;

  const lineas = visibles.map((p, i) => {
    const n = i + 1;
    return [
      `${n}. ${p.nombre}`,
      ...p.items.map((x) => `${nombreInsumo(x, categoria)} — ${x.stock}`),
      `Cómo llegar: https://www.google.com/maps?q=${p.lat},${p.lng}`,
      `Ficha: ${base}/punto.html?id=${p.id}`,
    ].join("\n");
  });

  return conPieMenu([header, "", ...lineas].join("\n"));
}
