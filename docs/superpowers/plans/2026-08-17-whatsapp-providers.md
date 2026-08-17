# WhatsApp providers (WAHA | Meta) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El bot de consulta habla con WhatsApp a través de un puerto; WAHA y Meta Cloud API son adaptadores intercambiables por `WHATSAPP_PROVIDER`, default `waha`.

**Architecture:** Puertos y adaptadores en `bot/src/messaging/`. `dialog.js` no cambia. `server.js` inyecta el puerto (parse, firma, envío, GET verify). Factory `createMessaging(env)` como `createLlm`. Sin plantillas HSM, sin media, sin dos proveedores a la vez.

**Tech Stack:** Node 22, `node:test`, `node:http`, `node:crypto`, `fetch`. Graph `https://graph.facebook.com`. WAHA existente `https://waha.vowtech.lat`.

## Global Constraints

- Un proveedor activo: recibe el webhook y envía. El otro está apagado.
- `WHATSAPP_PROVIDER` unset/vacío → `waha`. Solo valores `waha` | `meta` (minúsculas).
- `IncomingMessage.from` y `sendText.to` son **solo dígitos** (sin `+`, sin `@c.us`).
- `parseIncoming(body)` siempre devuelve `IncomingMessage[]` (vacío = ignorar).
- `verifyWebhook(query)`: `{ ok: true, challenge }` | `{ ok: false }` | `null`.
- Mensajes V1: solo texto de sesión. Sin HSM, sin media útil, sin marcar leído.
- Diálogo, `GET /api/consultar`, PWA y Traefik `/wa-hook` no cambian de contrato.
- Sin puertos Docker públicos. No desplegar WAHA en este repo.
- `WAHA_SESSION` obligatorio si el activo es `waha`. Las cuatro `META_*` obligatorias si el activo es `meta`.
- Proceso no arranca si el proveedor activo está incompleto o el nombre es desconocido.
- Firma mala → 401. Handshake Meta malo → 403. GET con WAHA → 404. Fallo de `sendText` → log + HTTP 200.
- Tests: `cd bot && npm test` (`node --test`). `fetchImpl` inyectado; sin red real a Graph ni a WAHA.
- Conventional commits. Sin `any`. Sin estilos inline (este cambio no toca UI).
- Worktree: `/home/alore/projects/acopio-pereira/.worktrees/whatsapp-providers` en `feat/whatsapp-providers`.
- Spec: `docs/superpowers/specs/2026-08-17-whatsapp-providers-design.md`.

### File map

| Path | Responsibility |
|------|----------------|
| `bot/src/messaging/port.js` | JSDoc typedef `IncomingMessage` + `Messaging` |
| `bot/src/messaging/waha.js` | `createWahaMessaging` — parse WAHA, sendText, secret |
| `bot/src/messaging/meta.js` | `createMetaMessaging` — Graph, HMAC, GET verify |
| `bot/src/messaging/create.js` | `createMessaging(env)` elige adaptador y valida env |
| `bot/src/server.js` | HTTP inyecta `messaging`; GET verify; raw body |
| `bot/src/waha.js` | Eliminar en Task 3 (move) |
| `bot/src/webhook.js` | Eliminar en Task 3 (move) |
| `bot/test/messaging-waha.test.js` | Parse/send/firma WAHA |
| `bot/test/messaging-meta.test.js` | Parse/send/firma/verify Meta |
| `bot/test/messaging-create.test.js` | Factory + env |
| `bot/test/webhook.test.js` | Servidor contra el puerto (Task 3) |
| `docker-compose.prod.yml` | `WHATSAPP_PROVIDER` + `META_*` |
| `README.md`, `CLAUDE.md` | Switch y tabla de env |
| spec bot 2026-08-17 | Nota de supersede |

---

### Task 1: Adaptador WAHA (puerto)

**Files:**
- Create: `bot/src/messaging/port.js`
- Create: `bot/src/messaging/waha.js`
- Test: `bot/test/messaging-waha.test.js`

**Interfaces:**
- Consumes: nada del diálogo. Copia el comportamiento de `bot/src/waha.js` y `bot/src/webhook.js` (esos archivos **aún no se borran**).
- Produces:
  - JSDoc `IncomingMessage` y `Messaging` en `port.js` (sin runtime).
  - `createWahaMessaging({ wahaBase, apiKey, session, webhookSecret, fetchImpl }): Messaging`
  - `name === "waha"`
  - `parseIncoming(body): IncomingMessage[]`
  - `sendText({ to, text }): Promise<void>`
  - `verifyWebhook(_query): null`
  - `verifySignature({ headers, rawBody }): boolean`

- [ ] **Step 1: Write the failing test**

Create `bot/test/messaging-waha.test.js`:

```js
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

  it("parseIncoming maps fixture to digits from", () => {
    const [n] = make().parseIncoming(event);
    assert.deepEqual(n, {
      from: "573001112233",
      messageId: "true_57300@c.us_AAA",
      text: "dónde hay comida",
      hasMedia: false,
      fromMe: false,
      isGroup: false,
    });
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
    assert.equal(byJid.from, "120363");
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

  it("sendText posts chatId with @c.us", async () => {
    const sent = [];
    const m = make({
      fetchImpl: async (url, init) => {
        sent.push({ url: String(url), init });
        return { ok: true, status: 200 };
      },
    });
    await m.sendText({ to: "573001112233", text: "hola" });
    assert.equal(sent[0].url, "http://waha:3000/api/sendText");
    assert.equal(sent[0].init.headers["X-Api-Key"], "test-key");
    assert.deepEqual(JSON.parse(sent[0].init.body), {
      session: "default",
      chatId: "573001112233@c.us",
      text: "hola",
    });
  });

  it("sendText does not double @c.us", async () => {
    const sent = [];
    const m = make({
      fetchImpl: async (_url, init) => {
        sent.push(init);
        return { ok: true, status: 200 };
      },
    });
    await m.sendText({ to: "573001112233@c.us", text: "x" });
    assert.equal(JSON.parse(sent[0].body).chatId, "573001112233@c.us");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bot && node --test test/messaging-waha.test.js`

Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `../src/messaging/waha.js`.

- [ ] **Step 3: Write minimal implementation**

`bot/src/messaging/port.js` — only comments/typedef (no exports required):

```js
/**
 * @typedef {object} IncomingMessage
 * @property {string} from
 * @property {string} messageId
 * @property {string} text
 * @property {boolean} hasMedia
 * @property {boolean} fromMe
 * @property {boolean} isGroup
 *
 * @typedef {object} Messaging
 * @property {"waha"|"meta"} name
 * @property {(body: unknown) => IncomingMessage[]} parseIncoming
 * @property {(opts: { to: string, text: string }) => Promise<void>} sendText
 * @property {(query: URLSearchParams) =>
 *   { ok: true, challenge: string } | { ok: false } | null} verifyWebhook
 * @property {(opts: { headers: Record<string, string|string[]|undefined>, rawBody: string }) => boolean} verifySignature
 */
export {};
```

`bot/src/messaging/waha.js`:

- `MEDIA_TYPES` = `image, video, ptt, audio, document, sticker` (mismo set que `webhook.js`).
- `digitsOnly(value)` = `String(value ?? "").replace(/\D/g, "")`.
- `parseIncoming`: si `body` no es object o `event !== "message"` o `payload` no es object → `[]`. Un ítem: `from` = `digitsOnly(payload.from)`; `isGroup` si el `from` original termina en `@g.us` o `payload.isGroup === true`; `hasMedia` = `payload.hasMedia === true` o tipo en `MEDIA_TYPES`; `text` = `payload.body || payload.caption || ""` (string); `messageId` = `String(payload.id ?? "")`; `fromMe` = `payload.fromMe === true`.
- `sendText`: `chatId` = si `String(to)` incluye `@` usar `to` tal cual, si no `${digitsOnly(to)}@c.us`. `POST {wahaBase}/api/sendText` JSON `{ session, chatId, text }` header `X-Api-Key`. Red o `!res.ok` → throw `{ code: "waha_error", status }`.
- `verifyWebhook` → `null`.
- `verifySignature`: si no hay `webhookSecret` → `true`. Header `headers["x-webhook-secret"]` (Node lowercases). Comparar con `timingSafeEqual` solo si mismas longitudes (copiar `secretsMatch` de `server.js`).

No borrar `bot/src/waha.js` ni `bot/src/webhook.js` en esta task.

- [ ] **Step 4: Run tests**

Run: `cd bot && npm test`

Expected: PASS, incluido `messaging-waha.test.js` y los tests viejos de `webhook.test.js` (aún usan `waha.js` / `webhook.js`).

- [ ] **Step 5: Commit**

```bash
git add bot/src/messaging/port.js bot/src/messaging/waha.js bot/test/messaging-waha.test.js
git commit -m "feat(bot): WAHA messaging adapter behind a port"
```

---

### Task 2: Adaptador Meta Cloud API

**Files:**
- Create: `bot/src/messaging/meta.js`
- Test: `bot/test/messaging-meta.test.js`

**Interfaces:**
- Consumes: typedef en `port.js` (documental).
- Produces:
  - `createMetaMessaging({ phoneNumberId, accessToken, verifyToken, appSecret, graphVersion, fetchImpl }): Messaging`
  - `name === "meta"`
  - Graph default version `v21.0`, base `https://graph.facebook.com`
  - `sendText` → `POST {base}/{version}/{phoneNumberId}/messages` Bearer + JSON `{ messaging_product: "whatsapp", to, type: "text", text: { body } }`
  - throw `{ code: "meta_error", status }`
  - si el body de error Graph menciona `131047` o `window`, log tag `meta_window` (usar `console.error("meta_window", ...)`). Tests no tienen que capturar el log; sí el throw.
  - `verifyWebhook`: subscribe + token timing-safe → `{ ok: true, challenge }`; else `{ ok: false }`
  - `verifySignature`: `X-Hub-Signature-256` = `sha256=` + HMAC-SHA256 hex de `rawBody` con `appSecret`

- [ ] **Step 1: Write the failing test**

Create `bot/test/messaging-meta.test.js`:

```js
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
    assert.equal(sent[0].init.headers.authorization, "Bearer tok");
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
```

Header `Authorization`: Node `fetch` no lowercased outgoing custom headers. Set `Authorization: Bearer tok`. In the test, read `sent[0].init.headers.Authorization || sent[0].init.headers.authorization` — implement with key `Authorization`. Test should assert `sent[0].init.headers.Authorization === "Bearer tok"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bot && node --test test/messaging-meta.test.js`

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`createMetaMessaging`:

- `parseIncoming`: walk `entry[]` → `changes[]` → `value`. Collect from `value.messages` and `value.smb_message_echoes` (echoes: `fromMe: true`). Skip if no arrays. Per message:
  - `from` = digits of `from`
  - `messageId` = `String(id ?? "")`
  - `text` = `text.body` or `image.caption` or `video.caption` or `document.caption` or `""`
  - `hasMedia` if `type` in `{ image, audio, video, document, sticker }` or no usable text
  - `isGroup` if `message.group_id` or `value.group_id`
  - `fromMe` if came from `smb_message_echoes` OR digits(`from`) === digits(`value.metadata.display_phone_number`)
- `verifyWebhook(query)`: `query.get("hub.mode") === "subscribe"` AND timing-safe token vs `verifyToken` → `{ ok: true, challenge: String(query.get("hub.challenge") ?? "") }`. Else `{ ok: false }`. If token lengths differ, false (no throw).
- `verifySignature`: read `headers["x-hub-signature-256"]`. Must start with `sha256=`. HMAC-SHA256 hex of **raw string** `rawBody`. Compare hex buffers timing-safe (pad/length check first).
- `sendText`: `to` = `digitsOnly(to)`. POST Graph. If `!res.ok`, `await res.text()`, if includes `131047` or `/window/i` then `console.error("meta_window", status)`. throw `meta_error`.
- Default `graphVersion` = `v21.0` if missing. Strip slashes.

- [ ] **Step 4: Run tests**

Run: `cd bot && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bot/src/messaging/meta.js bot/test/messaging-meta.test.js
git commit -m "feat(bot): Meta Cloud API messaging adapter"
```

---

### Task 3: Factory + servidor HTTP sobre el puerto

**Files:**
- Create: `bot/src/messaging/create.js`
- Modify: `bot/src/server.js` (dejar de importar `waha.js` / `webhook.js`; inyectar `messaging`)
- Modify: `bot/test/webhook.test.js`
- Create: `bot/test/messaging-create.test.js`
- Delete: `bot/src/waha.js`, `bot/src/webhook.js` (solo si no quedan imports)

**Interfaces:**
- Consumes: `createWahaMessaging`, `createMetaMessaging`, `createDialog`, `createLlm`
- Produces:
  - `createMessaging(env, { fetchImpl }?): Messaging`  
    - provider = `String(env.WHATSAPP_PROVIDER || "waha").trim().toLowerCase()`  
    - `waha` → require `WAHA_SESSION` trim; else throw `{ code: "waha_session_missing" }`  
    - `meta` → require `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`, `META_VERIFY_TOKEN`, `META_APP_SECRET`; else throw `{ code: "meta_config_missing" }`  
    - otro → throw `{ code: "messaging_provider_unknown" }`  
    - waha defaults: `WAHA_BASE` → `https://waha.vowtech.lat`
    - meta: `META_GRAPH_VERSION` opcional
  - `createBotServer({ dialog, messaging })` — **ya no** recibe `wahaBase`, `wahaKey`, `session`, `webhookSecret`, `fetchImpl`
  - `listen` usa `createMessaging(env)`
  - GET `/salud` → `{ ok: true, provider: messaging.name, messaging: "ok" }`
  - GET `/webhook` y `/wa-hook`: `verifyWebhook(url.searchParams)` → 200 text/plain challenge | 403 | 404
  - POST: raw body → `verifySignature({ headers: req.headers, rawBody })` → 401 si false → JSON parse → for each `parseIncoming` → dialog → `sendText({ to: msg.from, text })`

- [ ] **Step 1: Write the failing factory test + update webhook tests first**

`bot/test/messaging-create.test.js`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMessaging } from "../src/messaging/create.js";

describe("createMessaging", () => {
  it("defaults to waha when unset", () => {
    const m = createMessaging({ WAHA_SESSION: "JJ" });
    assert.equal(m.name, "waha");
  });

  it("waha without session throws waha_session_missing", () => {
    assert.throws(
      () => createMessaging({}),
      (err) => err && err.code === "waha_session_missing",
    );
  });

  it("meta without token throws meta_config_missing", () => {
    assert.throws(
      () => createMessaging({ WHATSAPP_PROVIDER: "meta" }),
      (err) => err && err.code === "meta_config_missing",
    );
  });

  it("meta with four env vars builds meta adapter", () => {
    const m = createMessaging({
      WHATSAPP_PROVIDER: "META",
      META_PHONE_NUMBER_ID: "1",
      META_ACCESS_TOKEN: "t",
      META_VERIFY_TOKEN: "v",
      META_APP_SECRET: "s",
    });
    assert.equal(m.name, "meta");
  });

  it("unknown provider throws messaging_provider_unknown", () => {
    assert.throws(
      () => createMessaging({ WHATSAPP_PROVIDER: "telegram" }),
      (err) => err && err.code === "messaging_provider_unknown",
    );
  });
});
```

Rewrite `bot/test/webhook.test.js` `startServer` to build a real WAHA adapter with captured `fetchImpl` (regresión: mismo POST a `/api/sendText`). Remove import of `normalizeWahaEvent`. Change salud expectation to `{ ok: true, provider: "waha", messaging: "ok" }`.

Add tests in the same file:

```js
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
```

`startServer` after the change:

```js
async function startServer({ dialog, fetchImpl, webhookSecret } = {}) {
  const sent = [];
  const wahaFetch =
    fetchImpl ??
    (async (url, init) => {
      sent.push({ url: String(url), init });
      return { ok: true, status: 200, async json() { return {}; }, async text() { return ""; } };
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
  // listen 0 / return { base, server, sent, close } igual que hoy
}
```

Keep: POST sendText once, duplicate, group no send, invalid JSON 400, sendText failure 200, `/wa-hook`, secret missing/wrong/ok, `listen` requires `WAHA_SESSION`.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `cd bot && node --test test/messaging-create.test.js test/webhook.test.js`

Expected: FAIL — `create.js` missing and/or `createBotServer` still requires `wahaBase`; salud still `{ waha: "unknown" }`.

- [ ] **Step 3: Implement factory + server**

`create.js`:

```js
import { createWahaMessaging } from "./waha.js";
import { createMetaMessaging } from "./meta.js";

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
```

`server.js`:

- Import `createMessaging` instead of `sendText` / `normalizeWahaEvent`.
- `createBotServer({ dialog, messaging })`.
- GET `/salud` → `json(res, 200, { ok: true, provider: messaging.name, messaging: "ok" })`.
- GET `/webhook` | `/wa-hook`:
  - `const verdict = messaging.verifyWebhook(url.searchParams)`
  - `verdict == null` → `json(res, 404, { error: "no_encontrado" })`
  - `verdict.ok === true` → `res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); res.end(verdict.challenge)`
  - else → `json(res, 403, { error: "no_autorizado" })`
- POST `/webhook` | `/wa-hook`:
  - `rawBody = await readBody(req)`
  - if `!messaging.verifySignature({ headers: req.headers, rawBody })` → 401
  - `JSON.parse(rawBody)` catch → 400
  - `for (const msg of messaging.parseIncoming(body)) { const result = await dialog.handleIncoming(msg); if (result?.send) { try { await messaging.sendText({ to: msg.from, text: result.text ?? "" }); } catch (err) { console.error("sendText failed", err?.message); } } }`
  - always 200 `{ ok: true }` after valid JSON (same as today)
- `listen`: `const messaging = createMessaging(env, { fetchImpl });` then `createBotServer({ dialog, messaging })`. Remove the `WAHA_SESSION` check from `listen` (factory owns it). `listen` still throws the same code for missing session when provider is waha.

Delete `bot/src/waha.js` and `bot/src/webhook.js` after grepping that nothing imports them.

- [ ] **Step 4: Run tests**

Run: `cd bot && npm test`

Expected: PASS. In particular webhook POST still hits `http://waha:3000/api/sendText` with `chatId: "573001112233@c.us"`.

- [ ] **Step 5: Commit**

```bash
git add bot/src/messaging/create.js bot/src/server.js bot/test/webhook.test.js bot/test/messaging-create.test.js
git rm bot/src/waha.js bot/src/webhook.js
git commit -m "feat(bot): switch WhatsApp transport via WHATSAPP_PROVIDER"
```

---

### Task 4: Compose, docs y nota de supersede

**Files:**
- Modify: `docker-compose.prod.yml`
- Modify: `README.md` (sección Bot WhatsApp + tabla env)
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-17-whatsapp-bot-design.md` (nota de supersede; no reescribir el spec)

**Interfaces:**
- Consumes: env names from Task 3
- Produces: compose interpola `WHATSAPP_PROVIDER` default `waha` y `META_*`; README explica el flip; CLAUDE menciona el puerto

- [ ] **Step 1: No unit test — verify compose has no public ports**

Read `docker-compose.prod.yml`. Confirm `bot` still only `expose: "3001"` (no `ports:`).

Add under `bot.environment` (keep existing WAHA/LLM):

```yaml
      WHATSAPP_PROVIDER: ${WHATSAPP_PROVIDER:-waha}
      META_PHONE_NUMBER_ID: ${META_PHONE_NUMBER_ID}
      META_ACCESS_TOKEN: ${META_ACCESS_TOKEN}
      META_VERIFY_TOKEN: ${META_VERIFY_TOKEN}
      META_APP_SECRET: ${META_APP_SECRET}
      META_GRAPH_VERSION: ${META_GRAPH_VERSION:-v21.0}
```

Do **not** add `ports:`. Do **not** add a Meta container.

README — replace the bot intro so it says: default WAHA; switch `WHATSAPP_PROVIDER=meta` when the four `META_*` exist; same webhook URL. Add rows:

| Variable | Valor prod | Notas |
| `WHATSAPP_PROVIDER` | `waha` | `waha` o `meta` |
| `META_PHONE_NUMBER_ID` | (Dokploy, si meta) | |
| `META_ACCESS_TOKEN` | secret | |
| `META_VERIFY_TOKEN` | secret | Handshake GET |
| `META_APP_SECRET` | secret | HMAC `X-Hub-Signature-256` |
| `META_GRAPH_VERSION` | `v21.0` | opcional |

Keep WAHA rows. Mention Meta callback = `https://insumos.vowtech.lat/wa-hook`.

CLAUDE.md — after the WAHA paragraph, one short paragraph: transporte intercambiable (`WHATSAPP_PROVIDER`); default waha; Cloud API listo por env.

In `2026-08-17-whatsapp-bot-design.md` Decisions table, change the Tubería cell to note Cloud API is specified in `2026-08-17-whatsapp-providers-design.md`. In Fuera de V1, replace «WhatsApp Cloud API (oficial Meta)» with a pointer to that spec (implemented as adapter; not live until env flip).

Add spec link in README Spec section.

- [ ] **Step 2: Grep compose for public binds**

Run: `rg -n "ports:" docker-compose.prod.yml docker-compose.yml || true`

Expected: no `ports:` on `bot`/`api` in prod (or only if already loopback — prod file should have **zero** `ports:`).

- [ ] **Step 3: Run full bot tests again**

Run: `cd bot && npm test`

Expected: PASS (docs-only should not break tests).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.prod.yml README.md CLAUDE.md docs/superpowers/specs/2026-08-17-whatsapp-bot-design.md
git commit -m "docs(bot): document WAHA/Meta provider switch"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Puerto parse/send/verify/signature | 1–2 |
| `from` dígitos; WAHA re-añade `@c.us` | 1 |
| Meta parse, HMAC, GET verify, Graph send | 2 |
| `smb_message_echoes` / display_phone fromMe | 2 |
| Factory + env codes | 3 |
| server inject, salud, raw body, 401/403/404/200 | 3 |
| Default waha, listen throw | 3 |
| compose META_* sin ports | 4 |
| README / CLAUDE / supersede | 4 |
| No api/public/Traefik change | all (omitted on purpose) |
| Sin HSM / media / dual provider | all (omitted) |
