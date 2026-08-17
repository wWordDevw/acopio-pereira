import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createWahaMessaging } from "../src/messaging/waha.js";

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

function make({ fetchImpl, webhookSecret } = {}) {
  return createWahaMessaging({
    wahaBase: "http://waha:3000",
    apiKey: "test-key",
    session: "default",
    webhookSecret,
    fetchImpl: fetchImpl ?? (async () => ({ ok: true, status: 200 })),
  });
}

describe("createWahaMessaging", () => {
  it("name is waha and verifyWebhook is null", () => {
    const m = make();
    assert.equal(m.name, "waha");
    assert.equal(m.verifyWebhook(new URLSearchParams("hub.mode=subscribe")), null);
  });

  it("parseIncoming keeps the WAHA from JID", () => {
    const [n] = make().parseIncoming(event);
    assert.deepEqual(n, {
      from: "573001112233@c.us",
      messageId: "true_57300@c.us_AAA",
      text: "dónde hay comida",
      hasMedia: false,
      fromMe: false,
      isGroup: false,
    });
  });

  it("parseIncoming keeps @lid and converts @s.whatsapp.net", () => {
    const [lid] = make().parseIncoming({
      ...event,
      payload: { ...event.payload, from: "23423462304912@lid" },
    });
    assert.equal(lid.from, "23423462304912@lid");
    const [net] = make().parseIncoming({
      ...event,
      payload: { ...event.payload, from: "573001112233@s.whatsapp.net" },
    });
    assert.equal(net.from, "573001112233@c.us");
  });

  it("parseIncoming ignores message.any and missing payload", () => {
    const m = make();
    assert.deepEqual(m.parseIncoming({ ...event, event: "message.any" }), []);
    assert.deepEqual(m.parseIncoming({ event: "message" }), []);
    assert.deepEqual(m.parseIncoming(null), []);
  });

  it("isGroup from @g.us or payload.isGroup", () => {
    const m = make();
    const [byJid] = m.parseIncoming({
      ...event,
      payload: { ...event.payload, from: "120363@g.us" },
    });
    assert.equal(byJid.isGroup, true);
    assert.equal(byJid.from, "120363@g.us");
    const [byFlag] = m.parseIncoming({
      ...event,
      payload: { ...event.payload, isGroup: true },
    });
    assert.equal(byFlag.isGroup, true);
  });

  it("text from caption; hasMedia from type", () => {
    const [n] = make().parseIncoming({
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

  it("sendText posts chatId with @c.us when lids has no mapping", async () => {
    const sent = [];
    const m = make({
      fetchImpl: async (url, init) => {
        sent.push({ url: String(url), init });
        return {
          ok: true,
          status: 200,
          async json() {
            return { lid: null, pn: "573001112233@c.us" };
          },
        };
      },
    });
    await m.sendText({ to: "573001112233", text: "hola" });
    assert.ok(sent[0].url.includes("/api/default/lids/pn/573001112233"));
    assert.equal(sent[1].url, "http://waha:3000/api/sendText");
    assert.equal(sent[1].init.headers["X-Api-Key"], "test-key");
    assert.deepEqual(JSON.parse(sent[1].init.body), {
      session: "default",
      chatId: "573001112233@c.us",
      text: "hola",
    });
  });

  it("sendText uses lids @lid when mapping exists", async () => {
    const sent = [];
    const m = make({
      fetchImpl: async (url, init) => {
        sent.push({ url: String(url), init });
        return {
          ok: true,
          status: 200,
          async json() {
            return { lid: "23423462304912@lid", pn: "573001112233@c.us" };
          },
        };
      },
    });
    await m.sendText({ to: "573001112233", text: "hola" });
    assert.equal(JSON.parse(sent[1].init.body).chatId, "23423462304912@lid");
  });

  it("sendText does not rewrite incoming @lid or @c.us", async () => {
    const sent = [];
    const m = make({
      fetchImpl: async (_url, init) => {
        sent.push(init);
        return { ok: true, status: 200 };
      },
    });
    await m.sendText({ to: "573001112233@c.us", text: "x" });
    assert.equal(JSON.parse(sent[0].body).chatId, "573001112233@c.us");
    await m.sendText({ to: "23423462304912@lid", text: "y" });
    assert.equal(JSON.parse(sent[1].body).chatId, "23423462304912@lid");
  });

  it("sendText throws waha_error on HTTP failure", async () => {
    const m = make({
      fetchImpl: async () => ({ ok: false, status: 503 }),
    });
    await assert.rejects(() => m.sendText({ to: "57", text: "x" }), (err) => {
      return err && err.code === "waha_error" && err.status === 503;
    });
  });

  it("verifySignature true without secret; false if secret set and header missing/wrong", () => {
    assert.equal(make().verifySignature({ headers: {}, rawBody: "{}" }), true);
    const locked = make({ webhookSecret: "s3cret" });
    assert.equal(locked.verifySignature({ headers: {}, rawBody: "{}" }), false);
    assert.equal(
      locked.verifySignature({
        headers: { "x-webhook-secret": "wrong" },
        rawBody: "{}",
      }),
      false,
    );
    assert.equal(
      locked.verifySignature({
        headers: { "x-webhook-secret": "s3cret" },
        rawBody: "{}",
      }),
      true,
    );
  });
});
