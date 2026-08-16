import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDialog } from "../src/dialog.js";
import { createBotServer } from "../src/server.js";
import { normalizeWahaEvent } from "../src/webhook.js";

const event = {
  event: "message",
  session: "default",
  payload: {
    id: "true_57300@c.us_AAA",
    from: "573001112233@c.us",
    fromMe: false,
    body: "dónde hay comida",
    hasMedia: false,
    type: "chat",
  },
};

const PUNTO = {
  id: "p1",
  nombre: "Albergue X",
  lat: 4.8,
  lng: -75.7,
  inventario: [{ categoria: "comida", stock: 10 }],
};

function disabledLlm() {
  return {
    complete: async () => {
      throw Object.assign(new Error("llm_disabled"), { code: "llm_disabled" });
    },
  };
}

function fakeConsultar() {
  return async () => ({
    ok: true,
    status: 200,
    async json() {
      return { puntos: [PUNTO] };
    },
  });
}

function makeDialog() {
  return createDialog({
    apiBase: "http://api:3000",
    publicWeb: "https://insumos.vowtech.lat",
    llm: disabledLlm(),
    fetchImpl: fakeConsultar(),
  });
}

async function startServer({ dialog, fetchImpl } = {}) {
  const sent = [];
  const wahaFetch =
    fetchImpl ??
    (async (url, init) => {
      sent.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {};
        },
        async text() {
          return "";
        },
      };
    });
  const server = createBotServer({
    dialog: dialog ?? makeDialog(),
    wahaBase: "http://waha:3000",
    wahaKey: "test-key",
    session: "default",
    fetchImpl: wahaFetch,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    server,
    sent,
    async close() {
      await new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}

describe("normalizeWahaEvent", () => {
  it("maps fixture fields", () => {
    const n = normalizeWahaEvent(event);
    assert.deepEqual(n, {
      from: "573001112233@c.us",
      messageId: "true_57300@c.us_AAA",
      text: "dónde hay comida",
      hasMedia: false,
      fromMe: false,
      isGroup: false,
    });
  });

  it("ignores message.any", () => {
    assert.equal(normalizeWahaEvent({ ...event, event: "message.any" }), null);
  });

  it("returns null without payload or unknown event", () => {
    assert.equal(normalizeWahaEvent({ event: "message" }), null);
    assert.equal(normalizeWahaEvent({ event: "session.status", payload: {} }), null);
    assert.equal(normalizeWahaEvent(null), null);
  });

  it("fromMe still returns object", () => {
    const n = normalizeWahaEvent({
      ...event,
      payload: { ...event.payload, fromMe: true },
    });
    assert.equal(n.fromMe, true);
    assert.equal(n.from, event.payload.from);
  });

  it("isGroup from @g.us or payload.isGroup", () => {
    const byJid = normalizeWahaEvent({
      ...event,
      payload: { ...event.payload, from: "120363@g.us" },
    });
    assert.equal(byJid.isGroup, true);

    const byFlag = normalizeWahaEvent({
      ...event,
      payload: { ...event.payload, isGroup: true },
    });
    assert.equal(byFlag.isGroup, true);
  });

  it("text from caption when no body; hasMedia from type", () => {
    const n = normalizeWahaEvent({
      event: "message",
      payload: {
        id: "media-1",
        from: "573001112233@c.us",
        fromMe: false,
        caption: "cobijas",
        type: "image",
      },
    });
    assert.equal(n.text, "cobijas");
    assert.equal(n.hasMedia, true);
  });
});

describe("webhook server", () => {
  it("GET /salud is 200 with waha unknown", async () => {
    const srv = await startServer();
    try {
      const res = await fetch(`${srv.base}/salud`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true, waha: "unknown" });
    } finally {
      await srv.close();
    }
  });

  it("POST /webhook calls sendText once with that chatId", async () => {
    const srv = await startServer();
    try {
      const res = await fetch(`${srv.base}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      assert.equal(srv.sent.length, 1);
      assert.equal(srv.sent[0].url, "http://waha:3000/api/sendText");
      assert.equal(srv.sent[0].init.method, "POST");
      assert.equal(srv.sent[0].init.headers["X-Api-Key"], "test-key");
      const body = JSON.parse(srv.sent[0].init.body);
      assert.equal(body.chatId, "573001112233@c.us");
      assert.equal(body.session, "default");
      assert.equal(typeof body.text, "string");
      assert.ok(body.text.length > 0);
    } finally {
      await srv.close();
    }
  });

  it("duplicate event does not send twice", async () => {
    const srv = await startServer();
    try {
      const post = () =>
        fetch(`${srv.base}/webhook`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(event),
        });
      const first = await post();
      const second = await post();
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(srv.sent.length, 1);
    } finally {
      await srv.close();
    }
  });

  it("group @g.us does not sendText", async () => {
    const srv = await startServer();
    try {
      const res = await fetch(`${srv.base}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...event,
          payload: { ...event.payload, from: "120363@g.us", id: "grp-1" },
        }),
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      assert.equal(srv.sent.length, 0);
    } finally {
      await srv.close();
    }
  });

  it("invalid JSON is 400 json_invalido", async () => {
    const srv = await startServer();
    try {
      const res = await fetch(`${srv.base}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      });
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: "json_invalido" });
      assert.equal(srv.sent.length, 0);
    } finally {
      await srv.close();
    }
  });

  it("sendText failure still returns 200", async () => {
    const srv = await startServer({
      fetchImpl: async () => {
        throw new Error("waha_down");
      },
    });
    try {
      const res = await fetch(`${srv.base}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
    } finally {
      await srv.close();
    }
  });
});
