import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createDialog } from "../src/dialog.js";
import { createBotServer, listen } from "../src/server.js";
import { createWahaMessaging } from "../src/messaging/waha.js";
import { createMetaMessaging } from "../src/messaging/meta.js";

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

const META_APP_SECRET = "app-secret";

const metaEvent = {
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "573136732685",
              phone_number_id: "1099",
            },
            messages: [
              {
                from: "573001112233",
                id: "wamid.AAA",
                timestamp: "1",
                type: "text",
                text: { body: "dónde hay comida" },
              },
            ],
          },
        },
      ],
    },
  ],
};

function metaSignature(rawBody, secret = META_APP_SECRET) {
  const hex = createHmac("sha256", secret).update(rawBody).digest("hex");
  return `sha256=${hex}`;
}

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

async function startServer({ dialog, fetchImpl, webhookSecret } = {}) {
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
  const messaging = createWahaMessaging({
    wahaBase: "http://waha:3000",
    apiKey: "test-key",
    session: "default",
    webhookSecret,
    fetchImpl: wahaFetch,
  });
  const server = createBotServer({
    dialog: dialog ?? makeDialog(),
    messaging,
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

describe("webhook server", () => {
  it("GET /salud is 200 with provider waha", async () => {
    const srv = await startServer();
    try {
      const res = await fetch(`${srv.base}/salud`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), {
        ok: true,
        provider: "waha",
        messaging: "ok",
      });
    } finally {
      await srv.close();
    }
  });

  it("GET /webhook is 404 under waha", async () => {
    const srv = await startServer();
    try {
      const res = await fetch(`${srv.base}/webhook`);
      assert.equal(res.status, 404);
    } finally {
      await srv.close();
    }
  });

  it("GET /wa-hook with meta verify succeeds", async () => {
    const messaging = createMetaMessaging({
      phoneNumberId: "1",
      accessToken: "t",
      verifyToken: "verify-me",
      appSecret: "s",
      fetchImpl: async () => ({ ok: true, status: 200 }),
    });
    const dialog = makeDialog();
    const server = createBotServer({ dialog, messaging });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address();
    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/wa-hook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=99`,
      );
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type")?.includes("text/plain"), true);
      assert.equal(await res.text(), "99");
    } finally {
      await new Promise((r, j) => server.close((e) => (e ? j(e) : r())));
    }
  });

  it("POST /wa-hook Meta HMAC + Graph sendText", async () => {
    const sent = [];
    const messaging = createMetaMessaging({
      phoneNumberId: "1099",
      accessToken: "tok",
      verifyToken: "verify-me",
      appSecret: META_APP_SECRET,
      graphVersion: "v21.0",
      fetchImpl: async (url, init) => {
        sent.push({ url: String(url), init });
        return {
          ok: true,
          status: 200,
          async text() {
            return "{}";
          },
        };
      },
    });
    const dialog = makeDialog();
    const server = createBotServer({ dialog, messaging });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address();
    const raw = JSON.stringify(metaEvent);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/wa-hook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Hub-Signature-256": metaSignature(raw),
        },
        body: raw,
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      assert.equal(sent.length, 1);
      assert.equal(
        sent[0].url,
        "https://graph.facebook.com/v21.0/1099/messages",
      );
      assert.equal(sent[0].init.headers.Authorization, "Bearer tok");
      const body = JSON.parse(sent[0].init.body);
      assert.equal(body.messaging_product, "whatsapp");
      assert.equal(body.to, "573001112233");
      assert.equal(body.type, "text");
      assert.equal(typeof body.text.body, "string");
      assert.ok(body.text.body.length > 0);
    } finally {
      await new Promise((r, j) => server.close((e) => (e ? j(e) : r())));
    }
  });

  it("POST /wa-hook Meta missing or wrong HMAC is 401", async () => {
    const sent = [];
    const messaging = createMetaMessaging({
      phoneNumberId: "1099",
      accessToken: "tok",
      verifyToken: "verify-me",
      appSecret: META_APP_SECRET,
      graphVersion: "v21.0",
      fetchImpl: async (url, init) => {
        sent.push({ url: String(url), init });
        return {
          ok: true,
          status: 200,
          async text() {
            return "{}";
          },
        };
      },
    });
    const dialog = makeDialog();
    const server = createBotServer({ dialog, messaging });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address();
    const raw = JSON.stringify(metaEvent);
    try {
      const missing = await fetch(`http://127.0.0.1:${port}/wa-hook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: raw,
      });
      assert.equal(missing.status, 401);
      assert.deepEqual(await missing.json(), { error: "no_autorizado" });
      assert.equal(sent.length, 0);

      const wrong = await fetch(`http://127.0.0.1:${port}/wa-hook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Hub-Signature-256": "sha256=deadbeef",
        },
        body: raw,
      });
      assert.equal(wrong.status, 401);
      assert.deepEqual(await wrong.json(), { error: "no_autorizado" });
      assert.equal(sent.length, 0);
    } finally {
      await new Promise((r, j) => server.close((e) => (e ? j(e) : r())));
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

  it("POST /wa-hook is accepted like /webhook", async () => {
    const srv = await startServer();
    try {
      const res = await fetch(`${srv.base}/wa-hook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      assert.equal(srv.sent.length, 1);
      assert.equal(srv.sent[0].url, "http://waha:3000/api/sendText");
      const body = JSON.parse(srv.sent[0].init.body);
      assert.equal(body.chatId, "573001112233@c.us");
    } finally {
      await srv.close();
    }
  });

  it("WEBHOOK_SECRET missing header is 401 no_autorizado", async () => {
    const srv = await startServer({ webhookSecret: "s3cret" });
    try {
      const res = await fetch(`${srv.base}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      });
      assert.equal(res.status, 401);
      assert.deepEqual(await res.json(), { error: "no_autorizado" });
      assert.equal(srv.sent.length, 0);
    } finally {
      await srv.close();
    }
  });

  it("WEBHOOK_SECRET wrong header is 401", async () => {
    const srv = await startServer({ webhookSecret: "s3cret" });
    try {
      const res = await fetch(`${srv.base}/wa-hook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Webhook-Secret": "wrong",
        },
        body: JSON.stringify(event),
      });
      assert.equal(res.status, 401);
      assert.deepEqual(await res.json(), { error: "no_autorizado" });
      assert.equal(srv.sent.length, 0);
    } finally {
      await srv.close();
    }
  });

  it("listen requires WAHA_SESSION from env", () => {
    assert.throws(
      () =>
        listen({
          env: { API_BASE: "http://127.0.0.1:3000" },
          host: "127.0.0.1",
        }),
      (err) => err && err.code === "waha_session_missing",
    );
  });

  it("WEBHOOK_SECRET matching header allows /wa-hook", async () => {
    const srv = await startServer({ webhookSecret: "s3cret" });
    try {
      const res = await fetch(`${srv.base}/wa-hook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Webhook-Secret": "s3cret",
        },
        body: JSON.stringify(event),
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      assert.equal(srv.sent.length, 1);
    } finally {
      await srv.close();
    }
  });
});
