import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDialog } from "../src/dialog.js";
import { textoPedirTexto, textoRateLimit, textoApiCaida } from "../src/plantilla.js";

const API_BASE = "http://api:3000";
const PUBLIC_WEB = "https://insumos.vowtech.lat";

const PUNTO = {
  id: "p1",
  nombre: "Albergue X",
  lat: 4.8,
  lng: -75.7,
  inventario: [
    { categoria: "ninos", stock: 10 },
    { categoria: "agua", stock: 5 },
    { categoria: "cobijas", stock: 40 },
  ],
};

function disabledLlm() {
  return {
    complete: async () => {
      throw Object.assign(new Error("llm_disabled"), { code: "llm_disabled" });
    },
  };
}

function fakeConsultar({ status = 200, urls } = {}) {
  return async (url) => {
    if (urls) urls.push(String(url));
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return { puntos: [PUNTO] };
      },
    };
  };
}

function incoming(overrides = {}) {
  return {
    from: "573001112233@c.us",
    messageId: "m1",
    text: "",
    hasMedia: false,
    fromMe: false,
    isGroup: false,
    ...overrides,
  };
}

function makeDialog({ fetchImpl, llm, now } = {}) {
  return createDialog({
    apiBase: API_BASE,
    publicWeb: PUBLIC_WEB,
    llm: llm ?? disabledLlm(),
    now: now ?? (() => Date.now()),
    fetchImpl: fetchImpl ?? fakeConsultar(),
  });
}

describe("dialog", () => {
  it("dónde hay pañales consults ninos and replies with maps + ficha", async () => {
    const urls = [];
    const { handleIncoming } = makeDialog({ fetchImpl: fakeConsultar({ urls }) });
    const r = await handleIncoming(
      incoming({ text: "dónde hay pañales", messageId: "panales-1" }),
    );
    assert.equal(r.send, true);
    assert.ok(urls.some((u) => u.includes("categoria=ninos")), urls.join(" | "));
    assert.match(r.text, /Cómo llegar/);
    assert.match(r.text, /insumos\.vowtech\.lat\/punto\.html\?id=p1/);
  });

  it("necesito agua cerca then Cuba uses Cuba lat/lng", async () => {
    const urls = [];
    const { handleIncoming } = makeDialog({ fetchImpl: fakeConsultar({ urls }) });
    const first = await handleIncoming(
      incoming({ text: "necesito agua cerca", messageId: "cerca-1" }),
    );
    assert.equal(first.send, true);
    assert.match(first.text, /¿dónde\?|Ver todos/);

    const second = await handleIncoming(
      incoming({ text: "Cuba", messageId: "cerca-2" }),
    );
    assert.equal(second.send, true);
    const consult = urls.find((u) => u.includes("/api/consultar"));
    assert.ok(consult, "expected consultar URL");
    assert.match(consult, /lat=4\.796/);
    assert.match(consult, /lng=-75\.715/);
    assert.match(consult, /categoria=agua/);
  });

  it("hola is numbered start menu", async () => {
    const { handleIncoming } = makeDialog();
    const r = await handleIncoming(incoming({ text: "hola", messageId: "hola-1" }));
    assert.equal(r.send, true);
    assert.match(r.text, /^1 Comida$/m);
    assert.match(r.text, /cobijas en Cuba/);
  });

  it("hasMedia true asks for text", async () => {
    const { handleIncoming } = makeDialog();
    const r = await handleIncoming(
      incoming({ hasMedia: true, text: "", messageId: "media-1" }),
    );
    assert.equal(r.send, true);
    assert.equal(r.text, textoPedirTexto());
  });

  it("same messageId twice does not send again", async () => {
    const { handleIncoming } = makeDialog();
    const msg = incoming({ text: "hola", messageId: "dup-1" });
    const first = await handleIncoming(msg);
    const second = await handleIncoming(msg);
    assert.equal(first.send, true);
    assert.equal(second.send, false);
    assert.equal(second.text, null);
  });

  it("21 messages: last is rate limit text", async () => {
    const { handleIncoming } = makeDialog();
    let last;
    for (let i = 1; i <= 21; i++) {
      last = await handleIncoming(
        incoming({ text: "hola", messageId: `rate-${i}` }),
      );
    }
    assert.equal(last.send, true);
    assert.equal(last.text, textoRateLimit());
  });

  it("consultar 500 includes mapa URL", async () => {
    const { handleIncoming } = makeDialog({
      fetchImpl: fakeConsultar({ status: 500 }),
    });
    const r = await handleIncoming(
      incoming({ text: "dónde hay pañales", messageId: "down-1" }),
    );
    assert.equal(r.send, true);
    assert.equal(r.text, textoApiCaida(PUBLIC_WEB));
    assert.match(r.text, /insumos\.vowtech\.lat/);
  });

  it("xyzzy foobar + llm cobijas consults cobijas", async () => {
    const urls = [];
    const llm = {
      complete: async ({ messages, maxTokens }) => {
        assert.equal(maxTokens, 200);
        assert.ok(messages.some((m) => m.role === "system"));
        return {
          text: '{"categoria":"cobijas","zona":null,"intencion":"consultar"}',
        };
      },
    };
    const { handleIncoming } = makeDialog({
      llm,
      fetchImpl: fakeConsultar({ urls }),
    });
    const r = await handleIncoming(
      incoming({ text: "xyzzy foobar", messageId: "llm-1" }),
    );
    assert.equal(r.send, true);
    assert.ok(urls.some((u) => u.includes("categoria=cobijas")), urls.join(" | "));
    assert.match(r.text, /Albergue X/);
  });

  it("menu path hola → 5 → 1 consults cobijas without zone", async () => {
    const urls = [];
    const { handleIncoming } = makeDialog({ fetchImpl: fakeConsultar({ urls }) });
    await handleIncoming(incoming({ text: "hola", messageId: "m-h" }));
    const zona = await handleIncoming(incoming({ text: "5", messageId: "m-5" }));
    assert.match(zona.text, /Cobijas — ¿dónde\?/);
    const r = await handleIncoming(incoming({ text: "1", messageId: "m-1" }));
    assert.ok(urls.some((u) => u.includes("categoria=cobijas")));
    assert.ok(!urls.some((u) => /lat=/.test(u)));
    assert.match(r.text, /Albergue X/);
    assert.match(r.text, /\n\n0 Menú$/);
  });

  it("hola → 5 → 2 → 2 consults Cuba cobijas", async () => {
    const urls = [];
    const { handleIncoming } = makeDialog({ fetchImpl: fakeConsultar({ urls }) });
    await handleIncoming(incoming({ text: "hola", messageId: "b-h" }));
    await handleIncoming(incoming({ text: "5", messageId: "b-5" }));
    await handleIncoming(incoming({ text: "2", messageId: "b-2" }));
    const r = await handleIncoming(incoming({ text: "2", messageId: "b-cuba" }));
    const consult = urls.find((u) => u.includes("/api/consultar"));
    assert.match(consult, /categoria=cobijas/);
    assert.match(consult, /lat=4\.796/);
    assert.match(r.text, /Albergue X/);
  });

  it("after results 0 returns start menu", async () => {
    const { handleIncoming } = makeDialog();
    await handleIncoming(incoming({ text: "dónde hay pañales", messageId: "r1" }));
    const r = await handleIncoming(incoming({ text: "0", messageId: "r0" }));
    assert.match(r.text, /^1 Comida$/m);
  });

  it("out-of-range number on inicio does not call API or LLM", async () => {
    let llmCalls = 0;
    const urls = [];
    const llm = {
      complete: async () => {
        llmCalls += 1;
        return { text: "{}" };
      },
    };
    const { handleIncoming } = makeDialog({
      llm,
      fetchImpl: fakeConsultar({ urls }),
    });
    await handleIncoming(incoming({ text: "hola", messageId: "o1" }));
    const r = await handleIncoming(incoming({ text: "99", messageId: "o2" }));
    assert.equal(llmCalls, 0);
    assert.equal(urls.length, 0);
    assert.match(r.text, /^1 Comida$/m);
  });

  it("zona screen accepts typed barrio Boston", async () => {
    const urls = [];
    const { handleIncoming } = makeDialog({ fetchImpl: fakeConsultar({ urls }) });
    await handleIncoming(incoming({ text: "hola", messageId: "z1" }));
    await handleIncoming(incoming({ text: "6", messageId: "z2" }));
    const r = await handleIncoming(incoming({ text: "Boston", messageId: "z3" }));
    const consult = urls.find((u) => u.includes("/api/consultar"));
    assert.match(consult, /categoria=agua/);
    assert.match(consult, /lat=4\.808/);
    assert.match(r.text, /Albergue X/);
  });

  it("media keeps pending menu so 4 still works", async () => {
    const { handleIncoming } = makeDialog();
    await handleIncoming(incoming({ text: "hola", messageId: "md1" }));
    const media = await handleIncoming(
      incoming({ hasMedia: true, text: "", messageId: "md2" }),
    );
    assert.equal(media.text, textoPedirTexto());
    const zona = await handleIncoming(incoming({ text: "4", messageId: "md3" }));
    assert.match(zona.text, /Niños — ¿dónde\?/);
  });
});
