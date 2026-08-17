import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createMetaMessaging } from "../src/messaging/meta.js";

const SECRET = "app-secret";

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

function make({ fetchImpl, verifyToken = "verify-me" } = {}) {
  return createMetaMessaging({
    phoneNumberId: "1099",
    accessToken: "tok",
    verifyToken,
    appSecret: SECRET,
    graphVersion: "v21.0",
    fetchImpl: fetchImpl ?? (async () => ({ ok: true, status: 200, async text() { return "{}"; } })),
  });
}

describe("createMetaMessaging", () => {
  it("name is meta", () => {
    assert.equal(make().name, "meta");
  });

  it("parseIncoming maps Cloud API text message", () => {
    const [n] = make().parseIncoming(metaEvent);
    assert.deepEqual(n, {
      from: "573001112233",
      messageId: "wamid.AAA",
      text: "dónde hay comida",
      hasMedia: false,
      fromMe: false,
      isGroup: false,
    });
  });

  it("parseIncoming ignores statuses-only", () => {
    const body = {
      entry: [
        {
          changes: [
            { value: { statuses: [{ id: "wamid.x", status: "delivered" }] } },
          ],
        },
      ],
    };
    assert.deepEqual(make().parseIncoming(body), []);
  });

  it("parseIncoming maps several messages", () => {
    const body = structuredClone(metaEvent);
    body.entry[0].changes[0].value.messages.push({
      from: "573009998877",
      id: "wamid.BBB",
      type: "text",
      text: { body: "agua" },
    });
    const list = make().parseIncoming(body);
    assert.equal(list.length, 2);
    assert.equal(list[1].messageId, "wamid.BBB");
    assert.equal(list[1].from, "573009998877");
  });

  it("caption + image is hasMedia with text", () => {
    const body = structuredClone(metaEvent);
    body.entry[0].changes[0].value.messages = [
      {
        from: "573001112233",
        id: "wamid.IMG",
        type: "image",
        image: { caption: "cobijas", id: "media-1" },
      },
    ];
    const [n] = make().parseIncoming(body);
    assert.equal(n.text, "cobijas");
    assert.equal(n.hasMedia, true);
  });

  it("group_id marks isGroup; echo marks fromMe", () => {
    const grouped = structuredClone(metaEvent);
    grouped.entry[0].changes[0].value.messages[0].group_id = "g1";
    assert.equal(make().parseIncoming(grouped)[0].isGroup, true);

    const echo = structuredClone(metaEvent);
    echo.entry[0].changes[0].value.messages[0].from = "573136732685";
    assert.equal(make().parseIncoming(echo)[0].fromMe, true);

    const smb = {
      entry: [
        {
          changes: [
            {
              value: {
                smb_message_echoes: [
                  {
                    from: "573001112233",
                    id: "wamid.ECHO",
                    type: "text",
                    text: { body: "yo" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const [n] = make().parseIncoming(smb);
    assert.equal(n.fromMe, true);
    assert.equal(n.messageId, "wamid.ECHO");
  });

  it("verifyWebhook subscribe + token returns challenge", () => {
    const q = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "verify-me",
      "hub.challenge": "4242",
    });
    assert.deepEqual(make().verifyWebhook(q), { ok: true, challenge: "4242" });
  });

  it("verifyWebhook rejects bad token or mode", () => {
    const bad = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "nope",
      "hub.challenge": "1",
    });
    assert.deepEqual(make().verifyWebhook(bad), { ok: false });
    assert.deepEqual(make().verifyWebhook(new URLSearchParams()), { ok: false });
  });

  it("verifySignature accepts matching HMAC", () => {
    const raw = JSON.stringify(metaEvent);
    const hex = createHmac("sha256", SECRET).update(raw).digest("hex");
    const m = make();
    assert.equal(
      m.verifySignature({
        headers: { "x-hub-signature-256": `sha256=${hex}` },
        rawBody: raw,
      }),
      true,
    );
    assert.equal(
      m.verifySignature({
        headers: { "x-hub-signature-256": `sha256=${hex}` },
        rawBody: raw + "x",
      }),
      false,
    );
    assert.equal(m.verifySignature({ headers: {}, rawBody: raw }), false);
  });

  it("sendText posts Graph text payload", async () => {
    const sent = [];
    const m = make({
      fetchImpl: async (url, init) => {
        sent.push({ url: String(url), init });
        return { ok: true, status: 200, async text() { return "{}"; } };
      },
    });
    await m.sendText({ to: "573001112233", text: "hola" });
    assert.equal(
      sent[0].url,
      "https://graph.facebook.com/v21.0/1099/messages",
    );
    assert.equal(sent[0].init.headers.Authorization, "Bearer tok");
    assert.deepEqual(JSON.parse(sent[0].init.body), {
      messaging_product: "whatsapp",
      to: "573001112233",
      type: "text",
      text: { body: "hola" },
    });
  });

  it("sendText throws meta_error", async () => {
    const m = make({
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        async text() {
          return JSON.stringify({
            error: { code: 131047, message: "window" },
          });
        },
      }),
    });
    await assert.rejects(() => m.sendText({ to: "57", text: "x" }), (err) => {
      return err && err.code === "meta_error" && err.status === 400;
    });
  });
});
