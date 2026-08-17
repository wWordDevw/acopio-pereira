import { consultarInventario, queryConsulta } from "../../api/src/inventario.js";

/**
 * In-process inventory lookup. Same code path as GET /api/consultar.
 * @param {import("better-sqlite3").Database} db
 * @returns {(q: { categoria?: string|null, zona?: object|null }) => Promise<Array>}
 */
export function createConsultar(db) {
  return async function consultar({ categoria, zona } = {}) {
    try {
      return consultarInventario(db, queryConsulta({ categoria, zona }));
    } catch (err) {
      throw Object.assign(new Error(err?.message || "consulta_error"), {
        code: "api_error",
        cause: err,
      });
    }
  };
}
