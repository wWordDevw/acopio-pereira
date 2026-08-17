import { timingSafeEqual } from "node:crypto";

/** @import { Messaging } from "./port.js" */

const MEDIA_TYPES = new Set([
  "image",
  "video",
  "ptt",
  "audio",
  "document",
  "sticker",
]);

/**
 * @param {unknown} value
 * @returns {string}
 */
function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * WAHA chatId: keep @c.us / @lid / @g.us as-is.
 * Official docs: reply using the incoming payload `from` (it already has the
 * correct chatId). Do not rebuild `{digits}@c.us` — WEBJS then fails with
 * "No LID for user". Convert only @s.whatsapp.net → @c.us.
 * @param {unknown} raw
 * @returns {string}
 */
function toWahaChatId(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.endsWith("@s.whatsapp.net")) {
    return `${s.slice(0, -"@s.whatsapp.net".length)}@c.us`;
  }
  return s;
}

/**
 * @param {string} expected
 * @param {unknown} provided
 * @returns {boolean}
 */
function secretsMatch(expected, provided) {
  if (typeof provided !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * @param {{
 *   wahaBase: string,
 *   apiKey?: string,
 *   session: string,
 *   webhookSecret?: string,
 *   fetchImpl?: typeof fetch,
 * }} opts
 * @returns {Messaging}
 */
export function createWahaMessaging({
  wahaBase,
  apiKey,
  session,
  webhookSecret,
  fetchImpl = globalThis.fetch,
}) {
  const root = String(wahaBase || "").replace(/\/+$/, "");

  /**
   * GET /api/{session}/lids/pn/{phone} — official LID map.
   * @param {string} phone
   * @returns {Promise<string|null>}
   */
  async function resolveLid(phone) {
    const pn = digitsOnly(phone);
    if (!pn) return null;
    try {
      const res = await fetchImpl(
        `${root}/api/${encodeURIComponent(session)}/lids/pn/${encodeURIComponent(pn)}`,
        { headers: { "X-Api-Key": apiKey ?? "" } },
      );
      if (!res.ok) return null;
      const body = await res.json();
      if (body && typeof body.lid === "string" && body.lid.endsWith("@lid")) {
        return body.lid;
      }
    } catch {
      return null;
    }
    return null;
  }

  return {
    name: "waha",

    /**
     * @param {unknown} body
     */
    parseIncoming(body) {
      if (body == null || typeof body !== "object") return [];
      if (/** @type {{ event?: unknown }} */ (body).event !== "message") return [];
      const payload = /** @type {{ payload?: unknown }} */ (body).payload;
      if (payload == null || typeof payload !== "object") return [];

      const p = /** @type {Record<string, unknown>} */ (payload);
      const fromRaw = typeof p.from === "string" ? p.from : String(p.from ?? "");
      const from = toWahaChatId(fromRaw);
      const isGroup = from.endsWith("@g.us") || p.isGroup === true;
      const hasMedia =
        p.hasMedia === true || MEDIA_TYPES.has(/** @type {string} */ (p.type));
      const text = p.body || p.caption || "";

      return [
        {
          from,
          messageId: String(p.id ?? ""),
          text: typeof text === "string" ? text : String(text),
          hasMedia,
          fromMe: p.fromMe === true,
          isGroup,
        },
      ];
    },

    /**
     * @param {{ to: string, text: string }} opts
     */
    async sendText({ to, text }) {
      let chatId = toWahaChatId(to);
      if (chatId && !chatId.includes("@")) {
        const lid = await resolveLid(chatId);
        chatId = lid || `${digitsOnly(chatId)}@c.us`;
      }

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
    },

    /**
     * @param {URLSearchParams} _query
     */
    verifyWebhook(_query) {
      return null;
    },

    /**
     * @param {{ headers: Record<string, string|string[]|undefined>, rawBody: string }} opts
     */
    verifySignature({ headers }) {
      if (!webhookSecret) return true;
      return secretsMatch(webhookSecret, headers["x-webhook-secret"]);
    },
  };
}
