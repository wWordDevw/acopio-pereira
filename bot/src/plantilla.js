import { ETIQUETAS } from "../../api/src/categorias.js";

export const PUBLIC_WEB = "https://insumos.vowtech.lat";

function etiqueta(categoria) {
  return ETIQUETAS[categoria] ?? categoria ?? "insumos";
}

function webBase(publicWeb) {
  return publicWeb ?? PUBLIC_WEB;
}

/** Help text: categories + example. */
export function textoAyuda() {
  return (
    "Puedo decirte qué hay y a dónde ir.\n" +
    "Categorías: comida, medicinas, higiene, niños, cobijas, agua, ropa o mascotas.\n" +
    "Ejemplo: cobijas en Cuba"
  );
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
  return "Demasiadas consultas. Prueba en un rato o mira el mapa.";
}

/** API down; include map link. */
export function textoApiCaida(publicWeb) {
  const base = webBase(publicWeb);
  return `No pude consultar el inventario ahora. Mira el mapa: ${base}`;
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
    return `No hay ${etiq} registradas${donde}.\nMapa: ${base}`;
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

  return [header, "", ...lineas].join("\n");
}
