import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDialog } from "../src/dialog.js";
import { textoPedirTexto, textoRateLimit, textoApiCaida } from "../src/plantilla.js";

const PUBLIC_WEB = "https://insumos.vowtech.lat";

const PUNTO = {
  id: "p1",
  nombre: "Albergue X",
  lat: 4.8,
  lng: -75.7,
  inventario: [
    { categoria: "ninos", producto_id: "n1", nombre: "Pañales", stock: 10 },
    { categoria: "agua", producto_id: "a1", nombre: "Agua potable", stock: 5 },
    { categoria: "cobijas", producto_id: "c1", nombre: "Cobijas", stock: 40 },
  ],
};

function disabledLlm() {
  return {
    complete: async () => {
      throw Object.assign(new Error("llm_disabled"), { code: "llm_disabled" });
    },
  };
}

function fakeConsultar({ puntos = [PUNTO], error, calls } = {}) {
  return async (query) => {
    if (calls) calls.push(query);
    if (error) throw error;
    return puntos;
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

function makeDialog({ consultar, llm, now } = {}) {
  return createDialog({
    consultar: consultar ?? fakeConsultar(),
    publicWeb: PUBLIC_WEB,
    llm: llm ?? disabledLlm(),
    now: now ?? (() => Date.now()),
  });
}

describe("dialog", () => {
  it("dónde hay pañales consults ninos and replies with maps + ficha", async () => {
    const calls = [];
    const { handleIncoming } = makeDialog({
      consultar: fakeConsultar({ calls }),
    });
    const r = await handleIncoming(
      incoming({ text: "dónde hay pañales", messageId: "panales-1" }),
    );
    assert.equal(r.send, true);
    assert.equal(calls[0].categoria, "ninos");
    assert.match(r.text, /Cómo llegar/);
    assert.match(r.text, /insumos\.vowtech\.lat\/punto\.html\?id=p1/);
  });

  it("necesito agua cerca then Cuba uses Cuba lat/lng", async () => {
    const calls = [];
    const { handleIncoming } = makeDialog({
      consultar: fakeConsultar({ calls }),
    });
    const first = await handleIncoming(
      incoming({ text: "necesito agua cerca", messageId: "cerca-1" }),
    );
    assert.equal(first.send, true);
    assert.match(first.text, /¿dónde\?|Ver todos/);

    const second = await handleIncoming(
      incoming({ text: "Cuba", messageId: "cerca-2" }),
    );
    assert.equal(second.send, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].categoria, "agua");
    assert.equal(calls[0].zona.lat, 4.796);
    assert.equal(calls[0].zona.lng, -75.715);
  });

  it("hola is numbered start menu", async () => {
    const { handleIncoming } = makeDialog();
    const r = await handleIncoming(incoming({ text: "hola", messageId: "hola-1" }));
    assert.equal(r.send, true);
    assert.match(r.text, /^1\. 🍚 Comida$/m);
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
      consultar: fakeConsultar({
        error: Object.assign(new Error("api_error"), { code: "api_error" }),
      }),
    });
    const r = await handleIncoming(
      incoming({ text: "dónde hay pañales", messageId: "down-1" }),
    );
    assert.equal(r.send, true);
    assert.equal(r.text, textoApiCaida(PUBLIC_WEB));
    assert.match(r.text, /insumos\.vowtech\.lat/);
  });

  it("xyzzy foobar + llm cobijas consults cobijas", async () => {
    const calls = [];
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
      consultar: fakeConsultar({ calls }),
    });
    const r = await handleIncoming(
      incoming({ text: "xyzzy foobar", messageId: "llm-1" }),
    );
    assert.equal(r.send, true);
    assert.equal(calls[0].categoria, "cobijas");
    assert.match(r.text, /Albergue X/);
  });

  it("zona screen «ver todos» consults category without zone and skips LLM", async () => {
    const calls = [];
    let llmCalls = 0;
    const llm = {
      complete: async () => {
        llmCalls += 1;
        return {
          text: '{"categoria":"comida","zona":"Cuba","intencion":"consultar"}',
        };
      },
    };
    const comida = {
      ...PUNTO,
      inventario: [
        {
          categoria: "comida",
          producto_id: "ar-1",
          nombre: "Arroz",
          stock: 140,
        },
      ],
    };
    const { handleIncoming } = makeDialog({
      llm,
      consultar: fakeConsultar({ puntos: [comida], calls }),
    });
    await handleIncoming(incoming({ text: "hola", messageId: "vt-h" }));
    const zona = await handleIncoming(incoming({ text: "1", messageId: "vt-1" }));
    assert.match(zona.text, /🍚 Comida — ¿dónde\?/);
    const r = await handleIncoming(
      incoming({ text: "ver todos", messageId: "vt-all" }),
    );
    assert.equal(llmCalls, 0, "ver todos must not go to the LLM");
    assert.equal(calls[0].categoria, "comida");
    assert.equal(calls[0].zona, null);
    assert.match(r.text, /Arroz — 140/);
    assert.doesNotMatch(r.text, /No hay/i);
  });

  it("menu path hola → 5 → 1 consults cobijas without zone", async () => {
    const calls = [];
    const { handleIncoming } = makeDialog({
      consultar: fakeConsultar({ calls }),
    });
    await handleIncoming(incoming({ text: "hola", messageId: "m-h" }));
    const zona = await handleIncoming(incoming({ text: "5", messageId: "m-5" }));
    assert.match(zona.text, /🛏️ Cobijas — ¿dónde\?/);
    const r = await handleIncoming(incoming({ text: "1", messageId: "m-1" }));
    assert.equal(calls[0].categoria, "cobijas");
    assert.equal(calls[0].zona, null);
    assert.match(r.text, /Albergue X/);
    assert.match(r.text, /\n\n0\. Menú$/);
  });

  it("hola → 5 → 2 → 2 consults Cuba cobijas", async () => {
    const calls = [];
    const { handleIncoming } = makeDialog({
      consultar: fakeConsultar({ calls }),
    });
    await handleIncoming(incoming({ text: "hola", messageId: "b-h" }));
    await handleIncoming(incoming({ text: "5", messageId: "b-5" }));
    await handleIncoming(incoming({ text: "2", messageId: "b-2" }));
    const r = await handleIncoming(incoming({ text: "2", messageId: "b-cuba" }));
    assert.equal(calls[0].categoria, "cobijas");
    assert.equal(calls[0].zona.lat, 4.796);
    assert.match(r.text, /Albergue X/);
  });

  it("after results 0 returns start menu", async () => {
    const { handleIncoming } = makeDialog();
    await handleIncoming(incoming({ text: "dónde hay pañales", messageId: "r1" }));
    const r = await handleIncoming(incoming({ text: "0", messageId: "r0" }));
    assert.match(r.text, /^1\. 🍚 Comida$/m);
  });

  it("out-of-range number on inicio does not call API or LLM", async () => {
    let llmCalls = 0;
    const calls = [];
    const llm = {
      complete: async () => {
        llmCalls += 1;
        return { text: "{}" };
      },
    };
    const { handleIncoming } = makeDialog({
      llm,
      consultar: fakeConsultar({ calls }),
    });
    await handleIncoming(incoming({ text: "hola", messageId: "o1" }));
    const r = await handleIncoming(incoming({ text: "99", messageId: "o2" }));
    assert.equal(llmCalls, 0);
    assert.equal(calls.length, 0);
    assert.match(r.text, /^1\. 🍚 Comida$/m);
  });

  it("zona screen accepts typed barrio Boston", async () => {
    const calls = [];
    const { handleIncoming } = makeDialog({
      consultar: fakeConsultar({ calls }),
    });
    await handleIncoming(incoming({ text: "hola", messageId: "z1" }));
    await handleIncoming(incoming({ text: "6", messageId: "z2" }));
    const r = await handleIncoming(incoming({ text: "Boston", messageId: "z3" }));
    assert.equal(calls[0].categoria, "agua");
    assert.equal(calls[0].zona.lat, 4.808);
    assert.match(r.text, /Albergue X/);
  });

  it("hola → 2 → 3 lists acopios and 1 shows that point", async () => {
    const acopio = {
      id: "dfa",
      nombre: "Acopio · Tatama",
      lat: 4.81061,
      lng: -75.79814,
      inventario: [
        {
          categoria: "medicinas",
          producto_id: "ins-1",
          nombre: "Insulina",
          stock: 1,
        },
      ],
    };
    const { handleIncoming } = makeDialog({
      consultar: fakeConsultar({ puntos: [acopio, PUNTO] }),
    });
    await handleIncoming(incoming({ text: "hola", messageId: "ac-h" }));
    await handleIncoming(incoming({ text: "2", messageId: "ac-2" }));
    const list = await handleIncoming(incoming({ text: "3", messageId: "ac-3" }));
    assert.match(list.text, /Elige el acopio/);
    assert.match(list.text, /1\. Acopio · Tatama/);
    assert.doesNotMatch(list.text, /Albergue X/);
    const r = await handleIncoming(incoming({ text: "1", messageId: "ac-1" }));
    assert.match(r.text, /^1\. Acopio · Tatama$/m);
    assert.match(r.text, /^Insulina — 1$/m);
    assert.doesNotMatch(r.text, /medicinas$/im);
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
