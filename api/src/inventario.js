import { listPuntos } from "./db.js";
import { filtrarPuntos } from "./consultar.js";

/**
 * Filter query shared by the HTTP API and in-process callers (bot).
 * @param {{
 *   categoria?: string|null,
 *   zona?: { lat: number, lng: number, radioKm?: number }|null,
 *   q?: string|null,
 *   limit?: number,
 * }} [opts]
 */
export function queryConsulta({
  categoria = null,
  zona = null,
  q = null,
  limit = 200,
} = {}) {
  return {
    q,
    categoria,
    con_stock: Boolean(categoria),
    lat: zona?.lat ?? null,
    lng: zona?.lng ?? null,
    radio: zona?.radioKm ?? 5,
    limit,
  };
}

/**
 * List inventory points from the database. Used by GET /api/consultar
 * and by the WhatsApp bot — no HTTP hop.
 * @param {import("better-sqlite3").Database} db
 * @param {ReturnType<typeof queryConsulta>} query
 */
export function consultarInventario(db, query) {
  return filtrarPuntos(listPuntos(db), query);
}
