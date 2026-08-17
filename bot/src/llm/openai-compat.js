/**
 * OpenAI-compatible chat completions client (fetch-based).
 * @param {{ baseUrl: string, apiKey: string, model: string, fetchImpl?: typeof fetch, extraBody?: object }} opts
 */
export function createOpenAiCompat({
  baseUrl,
  apiKey,
  model,
  fetchImpl = globalThis.fetch,
  extraBody = {},
}) {
  const root = String(baseUrl || "").replace(/\/+$/, "");

  async function complete({ messages, jsonSchema, maxTokens } = {}) {
    void jsonSchema;
    const url = `${root}/chat/completions`;
    const body = {
      model,
      messages,
      max_completion_tokens: maxTokens ?? 200,
      temperature: 0.2,
      ...extraBody,
    };

    let res;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw Object.assign(new Error(err?.message || "llm_error"), {
        code: "llm_error",
        cause: err,
      });
    }

    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
      throw Object.assign(
        new Error(`llm_error: HTTP ${res.status}${detail ? ` ${detail}` : ""}`),
        { code: "llm_error", status: res.status },
      );
    }

    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw Object.assign(new Error("llm_error: invalid JSON response"), {
        code: "llm_error",
        cause: err,
      });
    }

    const text = data?.choices?.[0]?.message?.content || "";
    return { text, usage: data?.usage };
  }

  return { complete };
}
