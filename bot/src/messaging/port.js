/**
 * @typedef {object} IncomingMessage
 * @property {string} from
 * @property {string} messageId
 * @property {string} text
 * @property {boolean} hasMedia
 * @property {boolean} fromMe
 * @property {boolean} isGroup
 *
 * @typedef {object} Messaging
 * @property {"waha"|"meta"} name
 * @property {(body: unknown) => IncomingMessage[]} parseIncoming
 * @property {(opts: { to: string, text: string }) => Promise<void>} sendText
 * @property {(query: URLSearchParams) =>
 *   { ok: true, challenge: string } | { ok: false } | null} verifyWebhook
 * @property {(opts: { headers: Record<string, string|string[]|undefined>, rawBody: string }) => boolean} verifySignature
 */
export {};
