const MEDIA_TYPES = new Set([
  "image",
  "video",
  "ptt",
  "audio",
  "document",
  "sticker",
]);

/**
 * @param {unknown} body
 * @returns {{
 *   from: string,
 *   messageId: string,
 *   text: string,
 *   hasMedia: boolean,
 *   fromMe: boolean,
 *   isGroup: boolean,
 * } | null}
 */
export function normalizeWahaEvent(body) {
  if (body == null || typeof body !== "object") return null;
  if (body.event !== "message") return null;
  const payload = body.payload;
  if (payload == null || typeof payload !== "object") return null;

  const from = typeof payload.from === "string" ? payload.from : "";
  const isGroup = from.endsWith("@g.us") || payload.isGroup === true;
  const hasMedia =
    payload.hasMedia === true || MEDIA_TYPES.has(payload.type);
  const text = payload.body || payload.caption || "";

  return {
    from,
    messageId: String(payload.id ?? ""),
    text: typeof text === "string" ? text : String(text),
    hasMedia,
    fromMe: payload.fromMe === true,
    isGroup,
  };
}
