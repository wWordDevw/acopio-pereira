/**
 * POST {wahaBase}/api/sendText
 * @param {{
 *   wahaBase: string,
 *   apiKey?: string,
 *   session: string,
 *   chatId: string,
 *   text: string,
 *   fetchImpl?: typeof fetch,
 * }} opts
 */
export async function sendText({
  wahaBase,
  apiKey,
  session,
  chatId,
  text,
  fetchImpl = globalThis.fetch,
}) {
  const root = String(wahaBase || "").replace(/\/+$/, "");
  let res;
  try {
    res = await fetchImpl(`${root}/api/sendText`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Api-Key": apiKey ?? "",
      },
      body: JSON.stringify({ session, chatId, text }),
    });
  } catch (err) {
    throw Object.assign(new Error(err?.message || "waha_error"), {
      code: "waha_error",
      cause: err,
    });
  }

  if (!res.ok) {
    throw Object.assign(new Error(`waha_error: HTTP ${res.status}`), {
      code: "waha_error",
      status: res.status,
    });
  }

  return res;
}
