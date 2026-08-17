# Insumos Pereira — proveedores de WhatsApp (WAHA | Meta Cloud API)

**Fecha:** 2026-08-17  
**Producto:** El mismo bot de consulta (qué hay y a dónde ir), con transporte intercambiable.  
**Supersede:** en `2026-08-17-whatsapp-bot-design.md`, la fila «No Cloud API» y el ítem «WhatsApp Cloud API (oficial Meta)» de Fuera de V1. El resto de aquel spec (diálogo, parseVoz, MiniMax, inventario, PWA) **sigue vigente**.  
**Estado:** diseño de brainstorming; pendiente de aprobación del spec escrito.

---

## Contexto

Hoy el bot está pegado a WAHA: `server.js` importa `sendText` y `normalizeWahaEvent`. El diálogo ya es agnóstico (`{ from, messageId, text, hasMedia, fromMe, isGroup }`). El LLM ya se elige con un factory (`createLlm`). Falta el mismo corte para WhatsApp.

No hay credenciales de Cloud API todavía. WAHA sigue siendo el transporte de producción. Meta entra como adaptador listo: cuando existan las `META_*` en Dokploy, un env flipa entrada y salida.

---

## Decisiones

| Tema | Decisión |
|------|----------|
| Alcance | Un interruptor. El proveedor **activo** recibe el webhook **y** envía la respuesta. El otro está apagado. |
| Default | `WHATSAPP_PROVIDER=waha` (o unset). Prod no cambia de comportamiento. |
| Arquitectura | Puertos y adaptadores. Un contrato, dos implementaciones, factory como `createLlm`. Sin carpetas domain/application/infrastructure. |
| Diálogo | No se toca la semántica. Sigue consultando `GET /api/consultar` y plantillas actuales. |
| Mensajes V1 | Solo texto de sesión (el usuario escribió primero). Sin plantillas HSM, sin media, sin marcar leído. |
| Número público | `WHATSAPP_PUBLIC_NUMBER` en la API / PWA. Independiente del proveedor. |
| Webhook HTTP | Siguen `/wa-hook` y `/webhook`. Sin path nuevo en Traefik. |
| Credenciales Meta | No se commitean. El proceso **no arranca** si el proveedor activo no tiene las env obligatorias. |
| Dos canales a la vez | No. |

---

## Fuera de esta entrega

- Plantillas HSM / iniciar conversación fuera de la ventana de 24 h.
- Media, notas de voz, stickers como entrada útil (sigue pidiendo texto).
- Marcar mensajes como leídos.
- Dos proveedores vivos, failover automático, o A/B.
- Migrar el chip JJ (`573136732685`) a Cloud API.
- Registrar el webhook en Meta por API.
- STT, registrar stock por WhatsApp, grupos.
- Mover `dialog` / `plantilla` a una capa domain de libro.

---

## Arquitectura

Tres anillos. Solo el de afuera conoce WAHA o Meta.

```
WhatsApp (WAHA o Cloud API)
        │  POST /wa-hook  (+ GET hub.verify si es Meta)
        ▼
  server.js                 HTTP: raw body, firma, 200
        │  IncomingMessage[]
        ▼
  dialog.js                 consulta (sin cambios de contrato)
        │  { send, text }
        ▼
  puerto messaging          parseIncoming / sendText / verify*
        │
   ┌────┴────┐
   ▼         ▼
  waha      meta
```

| Anillo | Módulos | Dependencias |
|--------|---------|--------------|
| Dominio / aplicación | `dialog`, `interpretar`, `plantilla`, `zonas`, `consultar` | API de inventario, LLM. **Cero** WAHA/Meta. |
| Puerto | `bot/src/messaging/port.js` (JSDoc) + `create.js` | Env. No Graph, no WAHA. |
| Infra | `messaging/waha.js`, `messaging/meta.js` | `fetch`, crypto HMAC. |
| HTTP | `server.js` | Puerto + diálogo. |

`api/`, `public/` y el path Traefik `/wa-hook` no se modifican.

---

## Contrato del puerto

`createMessaging(env, { fetchImpl })` devuelve un objeto que cumple:

```js
/**
 * @typedef {object} IncomingMessage
 * @property {string} from         dígitos E.164 sin + ni @c.us  (ej. "573001112233")
 * @property {string} messageId    id estable del proveedor
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
 * @property {(opts: { headers: object, rawBody: string }) => boolean} verifySignature
 */
```

Reglas:

- `parseIncoming` **siempre** devuelve un array (vacío = ignorar: ack, status, evento desconocido, body inválido).
- `from` y `to` son solo dígitos. El adaptador WAHA quita `@c.us` al entrar y lo vuelve a poner al enviar.
- `verifyWebhook`: Meta implementa el handshake; WAHA devuelve `null`.
- `verifySignature`: `true` = aceptar. Comparación timing-safe.

No hay clase base ni `extends`. El test del servidor usa un fake que cumple el typedef.

---

## HTTP (`server.js`)

Rutas iguales. El servidor **no** importa `waha.js`.

| Método | Path | Comportamiento |
|--------|------|----------------|
| `GET` | `/salud` | `{ ok: true, provider, messaging: "ok" }`. `provider` es `messaging.name`. No se hace ping a Graph ni a WAHA. Si el proceso está arriba, el factory ya validó env → `messaging` es `"ok"`. |
| `GET` | `/webhook`, `/wa-hook` | Llama `verifyWebhook(query)`. `{ ok: true, challenge }` → `200` **texto plano** (no JSON) con ese challenge. `{ ok: false }` → `403` `{ error: "no_autorizado" }`. `null` (WAHA no usa GET) → `404` `{ error: "no_encontrado" }`. |
| `POST` | `/webhook`, `/wa-hook` | Lee **raw body** → `verifySignature`. Firma falsa → `401` `{ error: "no_autorizado" }`. JSON inválido → `400` `{ error: "json_invalido" }`. Por cada `parseIncoming` no vacío: `dialog.handleIncoming` y, si `send`, `sendText`. Cualquier fallo de diálogo o envío se loguea. Respuesta HTTP **siempre** `200 { ok: true }` si pasó la firma y el JSON (no reventar retries). |
| otro | | `404 { error: "no_encontrado" }` |

`listen`:

1. `createLlm` (igual).
2. `createDialog` (igual).
3. `createMessaging(env)` — **throws** si el proveedor activo está incompleto o el nombre no es `waha`/`meta`.
4. `createBotServer({ dialog, messaging })`. Ya no recibe `wahaBase` / `wahaKey` / `session`.

---

## Factory y env

`WHATSAPP_PROVIDER` se normaliza a minúsculas. Unset o vacío → `waha`. Cualquier otro valor → throw `code: "messaging_provider_unknown"`.

### `waha` (default)

Obligatorias: `WAHA_SESSION` (trim no vacío).  
Opcionales: `WAHA_BASE` (default `https://waha.vowtech.lat`), `WAHA_API_KEY`, `WEBHOOK_SECRET`.  
Si falta sesión: throw `code: "waha_session_missing"` (mismo código de hoy).

### `meta`

Obligatorias (trim no vacío):

| Variable | Uso |
|----------|-----|
| `META_PHONE_NUMBER_ID` | Path de Graph `/messages` |
| `META_ACCESS_TOKEN` | `Authorization: Bearer` |
| `META_VERIFY_TOKEN` | Handshake GET `hub.verify_token` |
| `META_APP_SECRET` | HMAC del POST |

Opcional: `META_GRAPH_VERSION` default `v21.0` (sin slash).  
Base fija: `https://graph.facebook.com`.  
Si falta alguna obligatoria: throw `code: "meta_config_missing"`.

Las env del proveedor inactivo se ignoran. No validar `META_*` cuando el activo es `waha`.

`docker-compose.prod.yml` añade `WHATSAPP_PROVIDER: ${WHATSAPP_PROVIDER:-waha}` y las `META_*` interpoladas. Default de compose = waha. Sin puertos públicos nuevos.

---

## Adaptador WAHA

Comportamiento actual, movido a `messaging/waha.js` (sale `bot/src/waha.js` y la lógica de `webhook.js`).

**parseIncoming**

- `body.event !== "message"` → `[]`.
- `payload` ausente → `[]`.
- Un solo `IncomingMessage`:
  - `from` = dígitos de `payload.from` (se elimina `@c.us` / no-dígitos).
  - `isGroup` = `from` original termina en `@g.us` o `payload.isGroup === true`.
  - `hasMedia` = `payload.hasMedia` o tipo en `{ image, video, ptt, audio, document, sticker }`.
  - `text` = `payload.body` o `payload.caption`.
  - `messageId` = `String(payload.id ?? "")`.
  - `fromMe` = `payload.fromMe === true`.

**sendText**

`POST {WAHA_BASE}/api/sendText`  
JSON `{ session, chatId: "{to}@c.us", text }`  
header `X-Api-Key`.  
Si `to` ya termina en `@c.us`, no duplicar el sufijo.  
HTTP no OK o red → throw `code: "waha_error"`.

**verifyWebhook** → `null`.

**verifySignature**

- Si `WEBHOOK_SECRET` no está set → `true`.
- Si está: `X-Webhook-Secret` timing-safe contra el secret. Header ausente o distinto → `false`.

---

## Adaptador Meta Cloud API

**verifyWebhook**

- `hub.mode === "subscribe"` y `hub.verify_token` === `META_VERIFY_TOKEN` (timing-safe) → `{ ok: true, challenge: String(hub.challenge ?? "") }`.
- Cualquier otro GET (token mal, mode distinto, params ausentes) → `{ ok: false }`.

El server **no** pregunta `messaging.name` para el GET: `ok: true` → 200 text/plain; `ok: false` → 403; `null` (WAHA) → 404.

**verifySignature**

- Header `X-Hub-Signature-256` debe ser `sha256=<hex>`.
- HMAC-SHA256 de `rawBody` con `META_APP_SECRET`.
- Comparar hex timing-safe. Header ausente, prefijo mal, o hex distinto → `false`.

**parseIncoming**

- Camino: `entry[]` → `changes[]` → `value`.
- `value.statuses` u otros cambios sin `messages` → no aportan ítems.
- Cada elemento de `value.messages[]`:
  - `isGroup` si existe `group_id` en el mensaje o en `value`.
  - `fromMe` si el lote es `smb_message_echoes` o si `from` (solo dígitos) coincide con `value.metadata.display_phone_number` (solo dígitos).
  - `text` = `text.body` o `image.caption` / `video.caption` / `document.caption` (string; si no hay, `""`).
  - `hasMedia` si `type` ∈ `{ image, audio, video, document, sticker }` o no hay texto útil.
  - `messageId` = `messages[].id`.
  - `from` = dígitos de `messages[].from`.
- Varios `messages` en un POST → varios `IncomingMessage` (el server itera).

**sendText**

`POST https://graph.facebook.com/{META_GRAPH_VERSION}/{META_PHONE_NUMBER_ID}/messages`

```json
{
  "messaging_product": "whatsapp",
  "to": "<digitos>",
  "type": "text",
  "text": { "body": "<text>" }
}
```

Header `Authorization: Bearer {META_ACCESS_TOKEN}`, `content-type: application/json`.  
HTTP no OK o red → throw `code: "meta_error"` (incluir `status` si hay).  
Si el body de error de Graph trae código de ventana 24 h (`131047` o mensaje equivalente), el log usa el tag `meta_window`. No se envían plantillas.

---

## Errores

| Situación | Comportamiento |
|-----------|----------------|
| Provider desconocido o env del activo faltando | El proceso no arranca. |
| Firma / secret inválido | `401`, no se llama al diálogo. |
| Handshake Meta inválido | `403`. |
| GET con proveedor WAHA | `404`. |
| Evento que no es mensaje (ack, status, grupo filtrado en diálogo) | Array vacío o `dialog` con `send: false`. `200`, silencio. |
| `sendText` falla (WAHA caído, token Meta, Graph 4xx/5xx, ventana 24 h) | Log + `200` al webhook. |
| API de inventario caída | Plantilla actual «no pude consultar». |
| Rate limit / idempotencia | Sin cambio (diálogo: 20/hora, `messageId` visto). |

Idempotencia: cada adaptador **debe** exponer un `messageId` estable (`payload.id` WAHA, `messages[].id` Meta). El `Set` sigue en `dialog.js`.

Logs: sin número completo (últimos 4) y sin cuerpo de mensaje en producción. Igual que el spec del bot.

---

## Pruebas (sin red real)

`fetchImpl` inyectado. Fixtures en los tests, no HTTP a Graph ni a `waha.vowtech.lat`.

| Capa | Qué |
|------|-----|
| WAHA parse | Fixture actual `event: message` → canónico con `from` en dígitos. Grupo `@g.us` → `isGroup`. `message.any` → `[]`. |
| WAHA send | `to: "57300…"` → POST `…/api/sendText` con `chatId: "57300…@c.us"`. |
| WAHA secret | Header mal → `verifySignature` false; sin `WEBHOOK_SECRET` → true. |
| Meta parse | Fixture Cloud API (`entry.changes.value.messages`) → canónico. `statuses` solo → `[]`. Varios `messages` → N ítems. |
| Meta verify | GET `hub.mode=subscribe` + token ok → challenge. Token mal → `{ ok: false }`. |
| Meta firma | HMAC correcto → true; body alterado o header ausente → false. |
| Meta send | URL Graph `/{version}/{phoneNumberId}/messages`, Bearer, `to` en dígitos, `type: text`. |
| Factory | Unset → `waha`. `waha` sin sesión → throw. `meta` sin token → throw. `telegram` → throw. |
| Servidor + fake | POST webhook llama `handleIncoming` y `sendText` del fake. Duplicado no envía dos veces. |
| Regresión | Webhook WAHA de hoy, `WHATSAPP_PROVIDER` unset, mismo POST a `{WAHA_BASE}/api/sendText`. |
| GET /salud | `{ ok: true, provider: "waha", messaging: "ok" }` (o `"meta"` si el fake se llama así). |

`bot/test/webhook.test.js` se adapta a `createBotServer({ dialog, messaging })`. No se pierde cobertura de `/wa-hook`, JSON inválido, secret, grupo.

La API y la PWA no ganan tests nuevos (no cambian).

---

## Archivos

```
bot/src/messaging/create.js
bot/src/messaging/port.js          # solo JSDoc / typedef
bot/src/messaging/waha.js          # move de waha.js + normalizeWahaEvent
bot/src/messaging/meta.js
bot/src/server.js                  # inyecta messaging; GET verify; raw body
bot/src/waha.js                    # se elimina (reexport no)
bot/src/webhook.js                 # se elimina si ya no hay consumidores
bot/test/messaging-waha.test.js
bot/test/messaging-meta.test.js
bot/test/messaging-create.test.js
bot/test/webhook.test.js           # adaptado
docker-compose.prod.yml            # WHATSAPP_PROVIDER + META_*
README.md
CLAUDE.md
docs/superpowers/specs/2026-08-17-whatsapp-bot-design.md
                                   # nota de supersede en tubería / Fuera de V1
```

No tocar `api/src`, `public/`, volúmenes, ni el proyecto Dokploy WAHA.

---

## Operación (cuando existan credenciales Meta)

1. En Dokploy (compose del bot): `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`, `META_VERIFY_TOKEN`, `META_APP_SECRET`. Opcional `META_GRAPH_VERSION`.
2. En el dashboard de Meta: callback `https://insumos.vowtech.lat/wa-hook`, verify token = `META_VERIFY_TOKEN`, campo `messages`.
3. `WHATSAPP_PROVIDER=meta` y redeploy del compose.
4. Si el número Cloud API no es el chip actual, actualizar `WHATSAPP_PUBLIC_NUMBER` en la API (el botón `wa.me`).
5. La sesión WAHA puede quedar en el dashboard; el bot ya no la llama.

Mientras no se haga el paso 3, producción sigue 100 % WAHA.

---

## Criterio de listo

- [ ] `cd bot && npm test` verde.
- [ ] Con el env de hoy (sin `WHATSAPP_PROVIDER`, con `WAHA_SESSION`) el bot envía por WAHA igual que antes.
- [ ] `WHATSAPP_PROVIDER=meta` sin las cuatro `META_*` → el proceso no arranca.
- [ ] Tests del adaptador Meta cubren parse, firma, GET verify y `sendText` a Graph (fake fetch).
- [ ] Diálogo, inventario, PWA y Traefik `/wa-hook` sin cambios de contrato.
- [ ] README documenta el switch y la tabla de env.
- [ ] No hay puertos Docker públicos nuevos.

Criterio manual (después, cuando haya app Meta): flip a `meta` en un ambiente de prueba, escribir al número Cloud API, recibir la misma plantilla de consulta.

---

## Future

1. Plantillas HSM para avisar fuera de ventana o iniciar conversación.
2. Failover WAHA ↔ Meta (sigue siendo un proveedor activo; el otro es reserva).
3. Ping real en `/salud` (`messaging: down` si Graph/WAHA no responden).
4. Varios números / varias apps Meta.
