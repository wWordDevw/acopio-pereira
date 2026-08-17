# WhatsApp consult bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot de WhatsApp (WAHA NOWEB) que responde qué insumos hay y a dónde ir, leyendo `GET /api/consultar`.

**Architecture:** Servicio Node `bot/` aparte. Reglas (`parseVoz` + zonas) primero; MiniMax-M3 solo si no entiende, detrás de un router OpenAI-compatible. Plantilla de respuesta en código. La API de inventario no cambia de contrato salvo `whatsapp` en `/api/salud`.

**Tech Stack:** Node 22, `node:test`, `node:http`, `fetch`. WAHA imagen `devlikeapro/waha:noweb`. Sin Chromium. Sin Whisper.

## Global Constraints

- Solo consulta. No registrar stock por WhatsApp.
- Solo texto. Audio / sticker / imagen → pedir que escriban.
- Un número, chats 1:1. Sin grupos.
- `parseVoz` y `CATEGORIAS` se importan de `api/src/`. No reimplementar el diccionario.
- LLM: contrato `complete({ messages, jsonSchema, maxTokens }) → { text, usage }`. V1 MiniMax-M3, `thinking: { type: "disabled" }`, `max_completion_tokens` 200. El modelo no redacta inventario.
- Estado de diálogo: 15 minutos, máx. 3 turnos, en memoria. No persistir chats ni teléfonos en SQLite.
- Rate limit: 20 mensajes por número WhatsApp por hora.
- Idempotencia: mismo `message.id` no vuelve a consultar ni responder.
- Máx. 3 puntos. Links `https://www.google.com/maps?q=LAT,LNG` y `https://insumos.vowtech.lat/punto.html?id=`.
- Sin puertos Docker públicos. **No desplegar WAHA en este repo.** Cliente: `WAHA_BASE=https://waha.vowtech.lat`, sesión `insumos`. Webhook público path `/wa-hook` en `insumos.vowtech.lat`.
- Sin estilos inline. Tailwind no aplica (PWA usa CSS propio).
- Tests: `node --test` (mismo estilo que `api/test`). Conventional commits.
- Worktree: `/home/alore/projects/acopio-pereira/.worktrees/whatsapp-bot` en `feat/whatsapp-bot`.

### File map

| Path | Responsibility |
|------|----------------|
| `bot/package.json` | Node 22, `"type": "module"`, `"test": "node --test test/*.test.js"` |
| `bot/src/zonas.js` | Gazetteer + `matchZona(texto)` |
| `bot/src/interpretar.js` | Reglas → `{ categoria, zona, intencion, necesitaCategoria, necesitaZona }` |
| `bot/src/plantilla.js` | Texto WhatsApp a partir de puntos |
| `bot/src/llm/router.js` | `createLlm(env)` |
| `bot/src/llm/openai-compat.js` | `complete` vía `POST {base}/chat/completions` |
| `bot/src/dialog.js` | Estado, rate limit, idempotencia, orquesta interpretar + consultar + plantilla |
| `bot/src/consultar.js` | Cliente `GET {API_BASE}/api/consultar` |
| `bot/src/waha.js` | `sendText`, ignore grupos |
| `bot/src/webhook.js` | Parse evento WAHA `message` |
| `bot/src/server.js` | HTTP `/webhook` + `/salud` |
| `bot/test/*.test.js` | Una suite por unidad |
| `bot/Dockerfile` | Context repo root; copia `bot/` + `api/src/parse-voz.js` + `api/src/categorias.js` |
| `api/src/server.js` | `whatsapp` en `/api/salud` |
| `public/index.html`, `public/lista.html`, `public/js/whatsapp.js` | Botón `wa.me` |
| `docker-compose.prod.yml` | `waha` + `bot` |

---

### Task 1: Gazetteer de zonas

**Files:**
- Create: `bot/package.json`
- Create: `bot/src/zonas.js`
- Test: `bot/test/zonas.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `ZONAS`: array of `{ id, nombre, aliases: string[], lat, lng, radioKm }`
  - `matchZona(texto: string): { id, nombre, lat, lng, radioKm } | null`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchZona, ZONAS } from "../src/zonas.js";

describe("matchZona", () => {
  it("matches Cuba without accent logic", () => {
    const z = matchZona("cobijas en Cuba");
    assert.equal(z.id, "cuba");
    assert.ok(z.lat > 4.7 && z.lat < 5.05);
  });

  it("matches La Virginia with and without article", () => {
    assert.equal(matchZona("la virginia").id, "la-virginia");
    assert.equal(matchZona("Virginia").id, "la-virginia");
  });

  it("returns null when no barrio", () => {
    assert.equal(matchZona("dónde hay pañales"), null);
  });

  it("includes required barrios", () => {
    const ids = ZONAS.map((z) => z.id);
    for (const id of [
      "centro",
      "cuba",
      "boston",
      "el-poblado",
      "consota",
      "circunvalar",
      "dosquebradas",
      "la-virginia",
      "expofuturo",
      "utp",
      "alamos",
    ]) {
      assert.ok(ids.includes(id), id);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bot && node --test test/zonas.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: Write package.json + zonas.js**

`bot/package.json`:

```json
{
  "name": "insumos-pereira-bot",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test test/*.test.js"
  }
}
```

`matchZona` folds NFD + lower + strip marks. A zone matches if any alias appears as a whole word (regex `(^|[^a-z0-9])alias([^a-z0-9]|$)` on folded text). Longest alias wins if two match.

Centroids (must use these):

| id | nombre | aliases | lat | lng | radioKm |
|----|--------|---------|-----|-----|---------|
| centro | Centro | centro, plaza de bolivar, plaza de bolívar | 4.8133 | -75.6961 | 2 |
| cuba | Cuba | cuba | 4.796 | -75.715 | 2 |
| boston | Boston | boston | 4.808 | -75.685 | 1.5 |
| el-poblado | El Poblado | el poblado, poblado | 4.82 | -75.68 | 1.5 |
| consota | Consotá | consota, consotá | 4.79 | -75.68 | 2 |
| circunvalar | La Circunvalar | circunvalar, la circunvalar | 4.805 | -75.70 | 1.5 |
| dosquebradas | Dosquebradas | dosquebradas, dos quebradas | 4.834 | -75.676 | 4 |
| la-virginia | La Virginia | la virginia, virginia | 4.899 | -75.880 | 4 |
| expofuturo | Expofuturo | expofuturo, expo futuro | 4.804 | -75.721 | 1.5 |
| utp | Universidad Tecnológica | utp, tecnologica, tecnológica, universidad tecnologica | 4.794 | -75.689 | 1.5 |
| alamos | Álamos | alamos, álamos | 4.82 | -75.71 | 1.5 |

- [ ] **Step 4: Run tests**

Run: `cd bot && node --test test/zonas.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add bot/package.json bot/src/zonas.js bot/test/zonas.test.js
git commit -m "feat(bot): gazetteer de zonas de Pereira"
```

---

### Task 2: interpretar (reglas)

**Files:**
- Create: `bot/src/interpretar.js`
- Test: `bot/test/interpretar.test.js`

**Interfaces:**
- Consumes: `parseVoz` from `../../api/src/parse-voz.js`, `categoriaDesdeTexto` + `CATEGORIAS` from `../../api/src/categorias.js`, `matchZona` from `./zonas.js`
- Produces:
  - `interpretar(texto: string): { categoria: string|null, zona: ReturnType<typeof matchZona>, zonaTexto: string|null, intencion: "consultar"|"ayuda"|"otro", necesitaCategoria: boolean, necesitaZona: boolean }`

Rules (apply in order):

1. Trim. Empty → `{ intencion: "otro", necesitaCategoria: true, necesitaZona: false, categoria: null, zona: null, zonaTexto: null }`.
2. Folded text is only `hola` / `hi` / `buenas` / `ayuda` / `menu` / `menú` / `start` → `intencion: "ayuda"`, no necesita*.
3. `categoria` = first `parseVoz(texto)` item whose categoria ≠ `otro`, else `categoriaDesdeTexto` of the whole string, else null.
4. `zona` = `matchZona(texto)`.
5. If folded text has `\bcerca\b` or `\bcercano[as]?\b` and `zona` is null → `necesitaZona: true`.
6. `intencion` = `consultar` if categoria or zona or necesitaZona; else `otro`.
7. `necesitaCategoria` = intencion is consultar and categoria is null.
8. `zonaTexto` = `zona.nombre` if zona, else null.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { interpretar } from "../src/interpretar.js";

describe("interpretar", () => {
  it("maps pañales to ninos", () => {
    const r = interpretar("dónde hay pañales");
    assert.equal(r.categoria, "ninos");
    assert.equal(r.intencion, "consultar");
    assert.equal(r.necesitaCategoria, false);
  });

  it("gets cobijas and Cuba", () => {
    const r = interpretar("cobijas en Cuba");
    assert.equal(r.categoria, "cobijas");
    assert.equal(r.zona.id, "cuba");
    assert.equal(r.necesitaZona, false);
  });

  it("asks zona when they say cerca", () => {
    const r = interpretar("necesito agua cerca");
    assert.equal(r.categoria, "agua");
    assert.equal(r.necesitaZona, true);
    assert.equal(r.zona, null);
  });

  it("ayuda on hola", () => {
    const r = interpretar("hola");
    assert.equal(r.intencion, "ayuda");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd bot && node --test test/interpretar.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement `interpretar`**

Import paths must be `../../api/src/parse-voz.js` and `../../api/src/categorias.js` from `bot/src/interpretar.js`.

- [ ] **Step 4: Run tests**

Run: `cd bot && node --test test/interpretar.test.js test/zonas.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add bot/src/interpretar.js bot/test/interpretar.test.js
git commit -m "feat(bot): interpretar categoría y zona por reglas"
```

---

### Task 3: Plantilla de respuesta

**Files:**
- Create: `bot/src/plantilla.js`
- Test: `bot/test/plantilla.test.js`

**Interfaces:**
- Consumes: `ETIQUETAS` from `../../api/src/categorias.js`
- Produces:
  - `PUBLIC_WEB` default `https://insumos.vowtech.lat` (arg override)
  - `textoAyuda(): string` — categorías + ejemplo `cobijas en Cuba`
  - `textoPedirTexto(): string` — `Escríbeme qué necesitas. Ej: cobijas en Cuba.`
  - `textoPedirCategoria(): string` — `¿Qué buscas? Comida, medicinas, higiene, niños, cobijas, agua, ropa o mascotas.`
  - `textoPedirZona(): string` — `¿En qué barrio o zona estás?`
  - `textoNoEntendi(): string` — `Escríbeme el insumo y el barrio. Ej: cobijas en Cuba.`
  - `textoRateLimit(): string` — `Demasiadas consultas. Prueba en un rato o mira el mapa.`
  - `textoApiCaida(publicWeb): string` — incluye `https://insumos.vowtech.lat`
  - `textoRespuesta({ categoria, zonaNombre, puntos, publicWeb }): string`
    - 0 puntos: `No hay {Etiqueta} registradas{ en {zona}}.` + `Mapa: {publicWeb}`
    - 1–3 puntos, each:
      `{n}. {nombre} — {stock} {etiqueta}`  
      `Cómo llegar: https://www.google.com/maps?q={lat},{lng}`  
      `Ficha: {publicWeb}/punto.html?id={id}`
    - stock = `inventario` item of that categoria `.stock`. Never more than 3 points (caller slices).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  textoAyuda,
  textoPedirTexto,
  textoRespuesta,
} from "../src/plantilla.js";

describe("plantilla", () => {
  it("ayuda includes the example", () => {
    assert.match(textoAyuda(), /cobijas en Cuba/);
  });

  it("asks for text when media arrives", () => {
    assert.match(textoPedirTexto(), /Escríbeme qué necesitas/);
  });

  it("zero stock points to the map", () => {
    const t = textoRespuesta({
      categoria: "cobijas",
      zonaNombre: "Cuba",
      puntos: [],
      publicWeb: "https://insumos.vowtech.lat",
    });
    assert.match(t, /No hay/i);
    assert.match(t, /Cuba/);
    assert.match(t, /insumos\.vowtech\.lat/);
  });

  it("one point has maps and ficha links", () => {
    const t = textoRespuesta({
      categoria: "cobijas",
      zonaNombre: "Cuba",
      publicWeb: "https://insumos.vowtech.lat",
      puntos: [
        {
          id: "abc",
          nombre: "Albergue X",
          lat: 4.8,
          lng: -75.7,
          inventario: [{ categoria: "cobijas", stock: 40 }],
        },
      ],
    });
    assert.match(t, /Albergue X — 40/);
    assert.match(t, /google\.com\/maps\?q=4\.8,-75\.7/);
    assert.match(t, /punto\.html\?id=abc/);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd bot && node --test test/plantilla.test.js`

- [ ] **Step 3: Implement plantilla.js** (plain template strings, no LLM).

- [ ] **Step 4: Run tests** — PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(bot): plantillas de respuesta de consulta"
```

---

### Task 4: Router LLM OpenAI-compatible (MiniMax)

**Files:**
- Create: `bot/src/llm/openai-compat.js`
- Create: `bot/src/llm/router.js`
- Test: `bot/test/llm-router.test.js`

**Interfaces:**
- Consumes: `fetch` (injectable)
- Produces:
  - `createOpenAiCompat({ baseUrl, apiKey, model, fetchImpl, extraBody }): { complete }`
  - `complete({ messages, jsonSchema, maxTokens })` POSTs `{baseUrl}/chat/completions` (no double slash; `baseUrl` has no trailing slash) with:
    ```js
    {
      model,
      messages,
      max_completion_tokens: maxTokens ?? 200,
      temperature: 0.2,
      ...extraBody
    }
    ```
    Header `Authorization: Bearer {apiKey}`, `content-type: application/json`.
    Returns `{ text: choices[0].message.content || "", usage }`.
    On non-2xx or network error: throw `Error` with `code: "llm_error"`.
  - `createLlm(env, { fetchImpl } = {})`:
    - if `!env.LLM_API_KEY` → `{ complete: async () => { throw Object.assign(new Error("llm_disabled"), { code: "llm_disabled" }) } }`
    - else `createOpenAiCompat({ baseUrl: env.LLM_BASE_URL || "https://api.minimax.io/v1", apiKey: env.LLM_API_KEY, model: env.LLM_MODEL || "MiniMax-M3", extraBody: { thinking: { type: "disabled" } }, fetchImpl })`

- [ ] **Step 1: Write failing test** with fake `fetchImpl` that records URL/body/headers and returns `{ choices: [{ message: { content: "{\"categoria\":\"cobijas\",\"zona\":\"cuba\",\"intencion\":\"consultar\"}" } }], usage: {} }`.

Assert:
- URL is `https://api.minimax.io/v1/chat/completions`
- `Authorization` starts with `Bearer `
- body.model === `MiniMax-M3`
- body.thinking.deepEqual `{ type: "disabled" }`
- body.max_completion_tokens === 200
- complete().text is the JSON string

Second test: no `LLM_API_KEY` → complete() rejects with `code === "llm_disabled"`.

- [ ] **Step 2: Run to verify fail**

- [ ] **Step 3: Implement**

Do **not** add the `openai` npm package. Use `fetch`.

- [ ] **Step 4: Run tests** — PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(bot): router LLM OpenAI-compat para MiniMax"
```

---

### Task 5: Diálogo (estado, rate limit, consultar)

**Files:**
- Create: `bot/src/consultar.js`
- Create: `bot/src/dialog.js`
- Test: `bot/test/dialog.test.js`

**Interfaces:**
- Consumes: `interpretar`, plantilla, `createLlm`
- Produces:
  - `consultarPuntos({ apiBase, categoria, zona, fetchImpl })`  
    If `zona` (object with lat/lng/radioKm):  
    `GET {apiBase}/api/consultar?categoria=&lat=&lng=&radio=`  
    Else: `GET {apiBase}/api/consultar?categoria=`  
    Return `body.puntos` or `[]`. Throw `{ code: "api_error" }` on !ok.
  - `createDialog({ apiBase, publicWeb, llm, now, fetchImpl })` → `{ handleIncoming }`
  - `handleIncoming({ from, messageId, text, hasMedia, fromMe, isGroup })` → `{ send: boolean, text: string|null }`

Behavior (in order):

1. `fromMe` or `isGroup` → `{ send: false, text: null }`
2. Same `messageId` already handled → `{ send: false, text: null }`
3. Count messages from `from` in last 3600000 ms; if ≥ 20 → `{ send: true, text: textoRateLimit() }` (still record messageId)
4. `hasMedia` and no usable text → `{ send: true, text: textoPedirTexto() }`
5. `interpretar(text)`
6. If `intencion === "ayuda"` → `textoAyuda()`
7. If `necesitaCategoria` or (`intencion === "otro"` and !categoria):
   - Call `llm.complete` with system: only extract JSON `{categoria,zona,intencion}` from the user text; categoria must be one of the slugs or null; do not invent stock. `maxTokens: 200`.
   - Parse JSON. If `categoria` is a known slug, merge. If `intencion === "ayuda"`, ayuda. If still no categoria → `textoPedirCategoria()` (or `textoNoEntendi()` if LLM threw / invalid JSON and original intencion was `otro`).
8. If `necesitaZona` and still no zona → `textoPedirZona()`. Store pending `{ categoria }` keyed by `from`.
9. Next message from same `from` within 15 min: if pending.categoria and new text matches a zona or is a zona-only interpretar, fill zona and continue.
10. If 3 turns already without a final list → `textoNoEntendi()` and clear state.
11. `consultarPuntos`. On api_error → `textoApiCaida(publicWeb)`.
12. Sort puntos by `inventario` stock of `categoria` desc (if no zona sort from API already by distance). Slice 0..3.
13. `textoRespuesta`. Clear pending. Increment turn.

`now` is `() => Date.now()` so tests freeze time.

- [ ] **Step 1: Write failing tests** (fake fetch for consultar, fake llm):

  1. `"dónde hay pañales"` → fetch URL contains `categoria=ninos`, reply includes `Cómo llegar` and a ficha host.
  2. `"necesito agua cerca"` then `"Cuba"` → second reply uses lat/lng of Cuba.
  3. `"hola"` → contains `cobijas en Cuba`.
  4. hasMedia true → pedir texto.
  5. same messageId twice → second `send: false`.
  6. 21 messages → last is rate limit text.
  7. consultar 500 → mapa URL.
  8. `"xyzzy foobar"` + llm returns cobijas → consultar cobijas.

Consultar fake: return one punto `{ id: "p1", nombre: "Albergue X", lat: 4.8, lng: -75.7, inventario: [{ categoria: "ninos", stock: 10 }, { categoria: "agua", stock: 5 }, { categoria: "cobijas", stock: 40 }] }`.

- [ ] **Step 2: Run to verify fail**

- [ ] **Step 3: Implement consultar.js + dialog.js**

- [ ] **Step 4: Run `cd bot && node --test`** — all green

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(bot): diálogo de consulta con rate limit e idempotencia"
```

---

### Task 6: Webhook WAHA + servidor HTTP

**Files:**
- Create: `bot/src/waha.js`
- Create: `bot/src/webhook.js`
- Create: `bot/src/server.js`
- Test: `bot/test/webhook.test.js`

**Interfaces:**
- Consumes: `createDialog`
- Produces:
  - `normalizeWahaEvent(body): { from, messageId, text, hasMedia, fromMe, isGroup } | null`
    - Only `event === "message"` (not `message.any`).
    - `payload.fromMe` → still return object (dialog drops it).
    - `from` = `payload.from` (e.g. `573001112233@c.us`).
    - `isGroup` = from ends with `@g.us` or `payload.isGroup === true`.
    - `messageId` = `payload.id` (string).
    - `text` = `payload.body` or `payload.caption` or `""`.
    - `hasMedia` = `payload.hasMedia === true` or type in `image|video|ptt|audio|document|sticker`.
    - Unknown event or missing payload → `null`.
  - `sendText({ wahaBase, apiKey, session, chatId, text, fetchImpl })`  
    `POST {wahaBase}/api/sendText` JSON `{ session, chatId, text }` header `X-Api-Key: {apiKey}`.
  - `createBotServer({ dialog, wahaBase, wahaKey, session, fetchImpl })`  
    `GET /salud` → `{ ok: true, waha: "unknown" }` (200).  
    `POST /webhook` → read JSON, normalize, handleIncoming, if `send` then sendText to `from`. Always 200 `{ ok: true }` even if send fails (log error). Invalid JSON → 400 `{ error: "json_invalido" }`.

- [ ] **Step 1: Write failing tests** with fixture:

```js
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
```

Assert normalize fields. Assert POST /webhook calls sendText once with that chatId. Assert duplicate event does not send twice. Assert `message.any` is ignored (null). Assert group `@g.us` → dialog send false → no sendText.

- [ ] **Step 2: Run to verify fail**

- [ ] **Step 3: Implement waha.js, webhook.js, server.js**

`listen` reads env: `PORT` default 3001, `API_BASE`, `PUBLIC_WEB`, `WAHA_BASE`, `WAHA_API_KEY`, `WAHA_SESSION` default `default`, `LLM_*`.

- [ ] **Step 4: Run `cd bot && node --test`** — PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(bot): webhook WAHA y servidor HTTP"
```

---

### Task 7: `whatsapp` en `/api/salud` + botón PWA

**Files:**
- Modify: `api/src/server.js` (`createServer` + `listen`)
- Modify: `api/src/openapi.js` schema `/api/salud`
- Modify: `api/test/server.test.js`
- Create: `public/js/whatsapp.js`
- Modify: `public/index.html`, `public/lista.html`
- Modify: `public/css/app.css` (class for the link, no inline styles)

**Interfaces:**
- Consumes: `process.env.WHATSAPP_PUBLIC_NUMBER`
- Produces:
  - `createServer({ db, trustProxy, whatsappNumber })`
  - `listen` passes `whatsappNumber: process.env.WHATSAPP_PUBLIC_NUMBER || null`
  - Normalize: strip spaces, `+`, dashes. If empty after normalize → `null`. If remaining is not `/^\d{8,15}$/` → `null`.
  - `GET /api/salud` and `/api/health` body: `{ ok: true, whatsapp: "57..." | null }`
  - PWA: `public/js/whatsapp.js` fetches `/api/salud`, if `whatsapp` set, inserts `<a class="btn" href="https://wa.me/{n}?text=Hola">Escribir por WhatsApp</a>` into `#whatsapp-slot` (empty `<div id="whatsapp-slot" class="whatsapp-slot"></div>` already in HTML). If null, leave empty.

- [ ] **Step 1: Extend `api/test/server.test.js`**

Default server (no number): `body.whatsapp === null`.  
New describe with `createServer({ db, whatsappNumber: "+57 300 111 2233" })`: salud returns `whatsapp === "573001112233"`. Invalid `"abc"` → null.

- [ ] **Step 2: Run `cd api && node --test test/server.test.js`** — FAIL on new asserts

- [ ] **Step 3: Implement server + openapi example `{ ok: true, whatsapp: null }`**

- [ ] **Step 4: PWA slot + JS + CSS** (reuse `.btn`, no `style=`)

- [ ] **Step 5: Run api tests** — PASS

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: wa.me en PWA vía /api/salud"
```

---

### Task 8: Compose bot (WAHA existente) + docs

**Files:**
- Create: `bot/Dockerfile`
- Modify: `docker-compose.prod.yml` (solo servicio `bot`; **prohibido** servicio `waha`)
- Modify: `bot/src/server.js` — aceptar path `/wa-hook` igual que `/webhook`; default `WAHA_BASE=https://waha.vowtech.lat`, `WAHA_SESSION=insumos`; si `WEBHOOK_SECRET` está set, exigir header `X-Webhook-Secret` (si no coincide → 401 `{ error: "no_autorizado" }`)
- Modify: `bot/test/webhook.test.js` — caso `/wa-hook` y secret
- Modify: `CLAUDE.md`, `README.md`

**Interfaces:**
- Consumes: WAHA ya vivo en `https://waha.vowtech.lat` (Dokploy proyecto WAHA, compose `waha-hqxniz`)
- Produces: solo `bot` en el compose de la API

`bot/Dockerfile` (build context = repo root):

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY bot/package.json ./bot/
COPY bot/src ./bot/src
COPY api/src/parse-voz.js api/src/categorias.js ./api/src/
WORKDIR /app/bot
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "src/server.js"]
```

`docker-compose.prod.yml` add **only** (no `waha`, no `waha_sessions`, no public `ports:`):

```yaml
  bot:
    build:
      context: .
      dockerfile: bot/Dockerfile
    environment:
      PORT: "3001"
      API_BASE: http://api:3000
      PUBLIC_WEB: https://insumos.vowtech.lat
      WAHA_BASE: https://waha.vowtech.lat
      WAHA_API_KEY: ${WAHA_API_KEY}
      WAHA_SESSION: insumos
      WEBHOOK_SECRET: ${WEBHOOK_SECRET}
      LLM_PROVIDER: minimax
      LLM_BASE_URL: https://api.minimax.io/v1
      LLM_MODEL: MiniMax-M3
      LLM_API_KEY: ${LLM_API_KEY}
    expose:
      - "3001"
    depends_on:
      - api
    restart: unless-stopped
```

Keep volume `acopio_data` only. Never rename it.

`CLAUDE.md`: V1 bot = texto; **reusa** `https://waha.vowtech.lat` (no segundo WAHA); sesión `insumos`; MiniMax fallback; no STT. QR en el dashboard existente. Issue #1 se cierra cuando el criterio de listo esté en prod.

`README.md`: el bot llama a WAHA existente; tabla de env; webhook `https://insumos.vowtech.lat/wa-hook` (Dokploy domain path, stripPath false).

- [ ] **Step 1: Dockerfile + compose (sin servicio waha) + /wa-hook + secret**
- [ ] **Step 2: `cd bot && node --test` and `cd api && node --test`** — still green
- [ ] **Step 3: Commit**

```bash
git commit -m "chore: bot en compose usando WAHA existente de vowtech"
```

---

## Spec coverage

| Spec section | Task |
|--------------|------|
| Conversación 2–3 turnos, 15 min | 5 |
| Zonas por texto + centroides | 1, 2 |
| parseVoz primero, LLM después | 2, 4, 5 |
| MiniMax-M3 thinking disabled, router | 4 |
| Plantilla, máx. 3, maps + ficha | 3, 5 |
| Sin audio V1 | 5, 6 |
| Rate 20/h, idempotencia, no PII SQLite | 5 |
| WAHA webhook, no grupos | 6 |
| Bot + API en compose; WAHA existente `waha.vowtech.lat`; no public ports | 8 |
| `/api/salud.whatsapp` + wa.me | 7 |
| Future STT | not implemented (correct) |
