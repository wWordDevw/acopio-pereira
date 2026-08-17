import { createHmac, timingSafeEqual } from "node:crypto";

/** @import { Messaging } from "./port.js" */

const GRAPH_BASE = "https://graph.facebook.com";
const DEFAULT_GRAPH_VERSION = "v21.0";

const MEDIA_TYPES = new Set([
  "image",
  "audio",
  "video",
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
 * @param {Record<string, unknown>} msg
 * @returns {string}
 */
function extractText(msg) {
  const text = msg.text;
  if (text != null && typeof text === "object") {
    const body = /** @type {{ body?: unknown }} */ (text).body;
    if (body != null && body !== "") return String(body);
  }
  for (const key of ["image", "video", "document"]) {
    const media = msg[key];
    if (media != null && typeof media === "object") {
      const caption = /** @type {{ caption?: unknown }} */ (media).caption;
      if (caption != null && caption !== "") return String(caption);
    }
  }
  return "";
}

/**
 * @param {Record<string, unknown>} msg
 * @param {Record<string, unknown>} value
 * @param {boolean} fromEcho
 * @returns {import("./port.js").IncomingMessage}
 */
function mapMessage(msg, value, fromEcho) {
  const type = typeof msg.type === "string" ? msg.type : "";
  const text = extractText(msg);
  const hasMedia = MEDIA_TYPES.has(type) || text === "";
  const from = digitsOnly(msg.from);
  const displayPhone = digitsOnly(
    value.metadata != null && typeof value.metadata === "object"
      ? /** @type {{ display_phone_number?: unknown }} */ (value.metadata)
          .display_phone_number
      : "",
  );
  const isGroup =
    msg.group_id != null ||
    value.group_id != null;

  return {
    from,
    messageId: String(msg.id ?? ""),
    text,
    hasMedia,
    fromMe: fromEcho || (displayPhone !== "" && from === displayPhone),
    isGroup: Boolean(isGroup),
  };
}

/**
 * @param {{
 *   phoneNumberId: string,
 *   accessToken: string,
 *   verifyToken: string,
 *   appSecret: string,
 *   graphVersion?: string,
 *   fetchImpl?: typeof fetch,
 * }} opts
 * @returns {Messaging}
 */
export function createMetaMessaging({
  phoneNumberId,
  accessToken,
  verifyToken,
  appSecret,
  graphVersion = DEFAULT_GRAPH_VERSION,
  fetchImpl = globalThis.fetch,
}) {
  const version = String(graphVersion || DEFAULT_GRAPH_VERSION).replace(
    /^\/+|\/+$/g,
    "",
  );
  const phoneId = String(phoneNumberId || "").replace(/^\/+|\/+$/g, "");

  return {
    name: "meta",

    /**
     * @param {unknown} body
     */
    parseIncoming(body) {
      if (body == null || typeof body !== "object") return [];
      const entry = /** @type {{ entry?: unknown }} */ (body).entry;
      if (!Array.isArray(entry)) return [];

      /** @type {import("./port.js").IncomingMessage[]} */
      const out = [];

      for (const ent of entry) {
        if (ent == null || typeof ent !== "object") continue;
        const changes = /** @type {{ changes?: unknown }} */ (ent).changes;
        if (!Array.isArray(changes)) continue;

        for (const change of changes) {
          if (change == null || typeof change !== "object") continue;
          const value = /** @type {{ value?: unknown }} */ (change).value;
          if (value == null || typeof value !== "object") continue;
          const v = /** @type {Record<string, unknown>} */ (value);

          const messages = v.messages;
          if (Array.isArray(messages)) {
            for (const msg of messages) {
              if (msg == null || typeof msg !== "object") continue;
              out.push(
                mapMessage(/** @type {Record<string, unknown>} */ (msg), v, false),
              );
            }
          }

          const echoes = v.smb_message_echoes;
          if (Array.isArray(echoes)) {
            for (const msg of echoes) {
              if (msg == null || typeof msg !== "object") continue;
              out.push(
                mapMessage(/** @type {Record<string, unknown>} */ (msg), v, true),
              );
            }
          }
        }
      }

      return out;
    },

    /**
     * @param {{ to: string, text: string }} opts
     */
    async sendText({ to, text }) {
      const url = `${GRAPH_BASE}/${version}/${phoneId}/messages`;
      let res;
      try {
        res = await fetchImpl(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: digitsOnly(to),
            type: "text",
            text: { body: text },
          }),
        });
      } catch (err) {
        throw Object.assign(new Error(err?.message || "meta_error"), {
          code: "meta_error",
          cause: err,
        });
      }

      if (!res.ok) {
        let bodyText = "";
        try {
          bodyText = await res.text();
        } catch {
          bodyText = "";
        }
        if (bodyText.includes("131047") || /window/i.test(bodyText)) {
          console.error("meta_window", res.status);
        }
        throw Object.assign(new Error(`meta_error: HTTP ${res.status}`), {
          code: "meta_error",
          status: res.status,
        });
      }
    },

    /**
     * @param {URLSearchParams} query
     */
    verifyWebhook(query) {
      if (query.get("hub.mode") !== "subscribe") return { ok: false };
      if (!secretsMatch(verifyToken, query.get("hub.verify_token"))) {
        return { ok: false };
      }
      return {
        ok: true,
        challenge: String(query.get("hub.challenge") ?? ""),
      };
    },

    /**
     * @param {{ headers: Record<string, string|string[]|undefined>, rawBody: string }} opts
     */
    verifySignature({ headers, rawBody }) {
      const header = headers["x-hub-signature-256"];
      const sig = Array.isArray(header) ? header[0] : header;
      if (typeof sig !== "string" || !sig.startsWith("sha256=")) return false;
      const providedHex = sig.slice("sha256=".length);
      const expectedHex = createHmac("sha256", appSecret)
        .update(rawBody)
        .digest("hex");
      return secretsMatch(expectedHex, providedHex);
    },
  };
}
