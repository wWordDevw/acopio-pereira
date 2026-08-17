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
      const isGroup = fromRaw.endsWith("@g.us") || p.isGroup === true;
      const hasMedia =
        p.hasMedia === true || MEDIA_TYPES.has(/** @type {string} */ (p.type));
      const text = p.body || p.caption || "";

      return [
        {
          from: digitsOnly(fromRaw),
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
      const toStr = String(to);
      const chatId = toStr.includes("@")
        ? toStr
        : `${digitsOnly(toStr)}@c.us`;

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
