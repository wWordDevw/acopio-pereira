import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLlm } from "../src/llm/router.js";

describe("llm router", () => {
  it("calls MiniMax OpenAI-compat with thinking disabled", async () => {
    const recorded = {};
    const content =
      '{"categoria":"cobijas","zona":"cuba","intencion":"consultar"}';

    const fetchImpl = async (url, opts) => {
      recorded.url = url;
      recorded.headers = opts.headers;
      recorded.body = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{ message: { content } }],
            usage: {},
          };
        },
      };
    };

    const llm = createLlm(
      {
        LLM_API_KEY: "test-key",
      },
      { fetchImpl },
    );

    const result = await llm.complete({
      messages: [{ role: "user", content: "cobijas en Cuba" }],
    });

    assert.equal(recorded.url, "https://api.minimax.io/v1/chat/completions");
    assert.ok(
      String(recorded.headers.Authorization || recorded.headers.authorization).startsWith(
        "Bearer ",
      ),
    );
    assert.equal(recorded.body.model, "MiniMax-M3");
    assert.deepEqual(recorded.body.thinking, { type: "disabled" });
    assert.equal(recorded.body.max_completion_tokens, 200);
    assert.equal(result.text, content);
  });

  it("rejects with llm_disabled when no LLM_API_KEY", async () => {
    const llm = createLlm({});
    await assert.rejects(
      () => llm.complete({ messages: [] }),
      (err) => {
        assert.equal(err.code, "llm_disabled");
        return true;
      },
    );
  });
});
