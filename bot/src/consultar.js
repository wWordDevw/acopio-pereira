/**
 * GET {apiBase}/api/consultar — inventory points for the bot.
 * @param {{
 *   apiBase: string,
 *   categoria?: string|null,
 *   zona?: { lat: number, lng: number, radioKm?: number }|null,
 *   fetchImpl?: typeof fetch,
 * }} opts
 * @returns {Promise<Array>}
 */
export async function consultarPuntos({
  apiBase,
  categoria,
  zona,
  fetchImpl = globalThis.fetch,
}) {
  const params = new URLSearchParams();
  if (categoria) params.set("categoria", categoria);
  if (zona && zona.lat != null && zona.lng != null) {
    params.set("lat", String(zona.lat));
    params.set("lng", String(zona.lng));
    params.set("radio", String(zona.radioKm ?? 2));
  }

  const root = String(apiBase || "").replace(/\/+$/, "");
  const url = `${root}/api/consultar?${params.toString()}`;

  let res;
  try {
    res = await fetchImpl(url);
  } catch (err) {
    throw Object.assign(new Error(err?.message || "api_error"), {
      code: "api_error",
      cause: err,
    });
  }

  if (!res.ok) {
    throw Object.assign(new Error(`api_error: HTTP ${res.status}`), {
      code: "api_error",
      status: res.status,
    });
  }

  let body;
  try {
    body = await res.json();
  } catch (err) {
    throw Object.assign(new Error("api_error: invalid JSON"), {
      code: "api_error",
      cause: err,
    });
  }

  return Array.isArray(body?.puntos) ? body.puntos : [];
}
