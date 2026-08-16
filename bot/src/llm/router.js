import { createOpenAiCompat } from "./openai-compat.js";

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export function createLlm(env, { fetchImpl } = {}) {
  if (!env?.LLM_API_KEY) {
    return {
      complete: async () => {
        throw Object.assign(new Error("llm_disabled"), { code: "llm_disabled" });
      },
    };
  }

  return createOpenAiCompat({
    baseUrl: env.LLM_BASE_URL || "https://api.minimax.io/v1",
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL || "MiniMax-M3",
    extraBody: { thinking: { type: "disabled" } },
    fetchImpl,
  });
}
