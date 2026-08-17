import { createWahaMessaging } from "./waha.js";
import { createMetaMessaging } from "./meta.js";

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export function createMessaging(env = {}, { fetchImpl } = {}) {
  const provider = String(env.WHATSAPP_PROVIDER || "waha").trim().toLowerCase();
  if (provider === "waha") {
    const session = String(env.WAHA_SESSION || "").trim();
    if (!session) {
      throw Object.assign(new Error("WAHA_SESSION is required"), {
        code: "waha_session_missing",
      });
    }
    return createWahaMessaging({
      wahaBase: env.WAHA_BASE || "https://waha.vowtech.lat",
      apiKey: env.WAHA_API_KEY,
      session,
      webhookSecret: env.WEBHOOK_SECRET,
      fetchImpl,
    });
  }
  if (provider === "meta") {
    const phoneNumberId = String(env.META_PHONE_NUMBER_ID || "").trim();
    const accessToken = String(env.META_ACCESS_TOKEN || "").trim();
    const verifyToken = String(env.META_VERIFY_TOKEN || "").trim();
    const appSecret = String(env.META_APP_SECRET || "").trim();
    if (!phoneNumberId || !accessToken || !verifyToken || !appSecret) {
      throw Object.assign(new Error("META_* env required"), {
        code: "meta_config_missing",
      });
    }
    return createMetaMessaging({
      phoneNumberId,
      accessToken,
      verifyToken,
      appSecret,
      graphVersion: env.META_GRAPH_VERSION,
      fetchImpl,
    });
  }
  throw Object.assign(new Error(`unknown provider: ${provider}`), {
    code: "messaging_provider_unknown",
  });
}
