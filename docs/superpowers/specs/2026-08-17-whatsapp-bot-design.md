# Insumos Pereira — bot WhatsApp (consulta)

**Fecha:** 2026-08-17  
**Producto:** Chatbot de WhatsApp que dice **qué insumos hay y a dónde ir**.  
**Issue:** https://github.com/wWordDevw/acopio-pereira/issues/1  
**Estado:** diseño de brainstorming; pendiente de aprobación del spec escrito.

---

## Contexto

Hoy el inventario solo se consulta en la PWA (`https://insumos.vowtech.lat`). En la emergencia la gente pregunta por WhatsApp. El bot lee la API pública existente; **no** es otro inventario ni un canal para registrar stock.

Ámbito: área metropolitana de Pereira (misma caja que la PWA). Un número (chip + QR). Solo chats 1:1.

---

## Decisiones

| Tema | Decisión |
|------|----------|
| Alcance V1 | Consulta conversacional (2–3 turnos). No registrar stock. |
| Número | Chip / WhatsApp normal. Sesión por QR. Un solo número. |
| Tubería | **WAHA ya desplegado** en `https://waha.vowtech.lat` (proyecto Dokploy `WAHA`, compose `waha-hqxniz`). No se vuelve a desplegar WAHA en este repo. No Baileys crudo. No Cloud API. |
| Ubicación | Barrio o zona **por texto**. No pin GPS de WhatsApp. |
| Entender | `parseVoz` + categorías + lista de zonas primero. **LLM solo si no entiende.** |
| LLM | Router intercambiable (contrato `complete`). V1: **MiniMax-M3** vía OpenAI-compatible. |
| Voz | **Fuera de V1.** Nota de voz / sticker / imagen → pedir texto. |
| Inventario | Solo `GET /api/consultar` (y `GET /api/puntos/:id` si hace falta). El modelo no inventa stock. |
| Persistencia de chat | Estado 15 min en memoria del bot. No guardar chats ni teléfonos en SQLite. |
| Deploy | Bot en el compose de la API (`api-persistente`). WAHA es el servicio existente. Bot **sin puertos públicos**. Sesión dedicada `insumos` en el WAHA compartido. |
| PWA | Publicar `wa.me/<número>` cuando el número esté vivo. |

---

## Fuera de V1

- Transcribir audio (Whisper / STT).
- Registrar entrada/salida por WhatsApp.
- Grupos, listas de difusión, broadcast.
- Pin de ubicación de WhatsApp.
- WhatsApp Cloud API (oficial Meta).
- Más de un número / varias sesiones.
- LLM redactando la respuesta de inventario.
- Guardar historial de chats.

---

## Conversación

El bot es de **consulta**. Un hilo dura como máximo **3 turnos** o **15 minutos** sin mensaje. Clave de estado: id de WhatsApp del remitente. Valor: `{ categoria, zona, turno, actualizadoAt }`. Si expira, se empieza de cero.

### Turno 1 — entender

1. Texto del mensaje (audio, sticker, imagen, documento: no se interpretan).
2. Extraer categoría con `parseVoz` / `categoriaDesdeTexto` (mismos slugs de la PWA: `comida`, `medicinas`, `higiene`, `ninos`, `cobijas`, `agua`, `ropa`, `mascotas`, `otro`).
3. Extraer zona: lista corta de Pereira / Dosquebradas / La Virginia (ver abajo). Si no hay match, el texto de zona se usa como `q` contra nombre/nota del punto.

### Si falta algo (turno 2)

| Situación | Respuesta |
|-----------|-----------|
| Sin categoría | «¿Qué buscas? Comida, medicinas, higiene, niños, cobijas, agua, ropa o mascotas.» |
| Dicen “cerca” y no hay zona | «¿En qué barrio o zona estás?» |
| Audio / no-texto | «Escríbeme qué necesitas. Ej: cobijas en Cuba.» |
| No entiende ni con LLM | «Escríbeme el insumo y el barrio. Ej: cobijas en Cuba.» |
| `hola` / `ayuda` / `menú` | Lista de categorías + un ejemplo. |

### Respuesta (máx. 3 puntos)

Solo puntos con **stock > 0** de esa categoría.

```
Cobijas cerca de Cuba:

1. Albergue X — 40 cobijas
   Cómo llegar: https://www.google.com/maps?q=LAT,LNG
   Ficha: https://insumos.vowtech.lat/punto.html?id=…

2. …
```

- Si hay zona conocida (centroide), ordenar por distancia (`lat`, `lng`, `radio`).
- Si la zona es texto libre, filtrar con `q` + `categoria`.
- Si no hay zona, el bot pide `GET /api/consultar?categoria=` (límite alto), ordena por stock de esa categoría de mayor a menor y se queda con 3.
- Sin stock: «No hay cobijas registradas en Cuba.» + una alternativa (otra zona con stock, o el mapa `https://insumos.vowtech.lat`).
- Tono: español claro, corto, de emergencia. Sin emojis de relleno. Sin “como IA…”.

### Lista de zonas V1

Tabla local en el bot (nombre canónico + alias + centroide + radio km). No es un geocoder externo.

Incluir al menos: Centro / Plaza de Bolívar, Cuba, Boston, El Poblado, Consotá, La Circunvalar, Dosquebradas, La Virginia, Expofuturo, Universidad Tecnológica, Álamos. Alias con tilde y sin tilde (`cuba`, `la virginia`). Si el texto no matchea, no se inventa un barrio: se usa como `q` o se pregunta.

---

## Entender: reglas y luego LLM

```
texto
  → parseVoz + categoriaDesdeTexto + matchZona
  → si hay categoria (y zona si la pidieron): consultar API
  → si no: LlmRouter.complete → { categoria, zona, intencion }
  → si el LLM tampoco: preguntar a palo seco
  → GET /api/consultar
  → plantilla de respuesta (código, no el modelo)
```

`intencion` admitida: `consultar` | `ayuda` | `otro`.  
`categoria` debe ser un slug de `CATEGORIAS` o `null`.  
`zona` es string libre o `null`; el bot vuelve a pasar por `matchZona`.

El modelo **no** recibe el inventario completo y **no** redacta la lista de puntos. Solo extrae intención. Si MiniMax falla o no hay `LLM_API_KEY`, se omite el paso y se pregunta.

---

## Router de LLM

El diálogo no importa MiniMax. Habla con:

```
complete({ messages, jsonSchema, maxTokens }) → { text, usage }
```

Un adaptador **OpenAI-compatible**. El proveedor es configuración.

| Variable | V1 MiniMax |
|----------|------------|
| `LLM_PROVIDER` | `minimax` |
| `LLM_BASE_URL` | `https://api.minimax.io/v1` |
| `LLM_MODEL` | `MiniMax-M3` |
| `LLM_API_KEY` | secret Dokploy |
| extra | `thinking: { type: "disabled" }` (M3; si no, razona y WhatsApp se siente lento) |
| tokens | `max_completion_tokens` ≈ 200 |

Docs oficiales: [OpenAI SDK](https://platform.minimax.io/docs/api-reference/text-openai-api), [Chat Completions](https://platform.minimax.io/docs/api-reference/text-chat-openai).  
`POST https://api.minimax.io/v1/chat/completions`, `Authorization: Bearer`.  
Cambiar a Groq / xAI / OpenAI = otras tres variables. No se toca el diálogo.

JSON de salida (schema fijo):

```json
{ "categoria": "cobijas", "zona": "cuba", "intencion": "consultar" }
```

Campos null si no hay. Si el texto no es JSON válido, se trata como “no entendí”.

---

## Arquitectura

Tres piezas (API + bot en este repo; WAHA ya existe). La API de inventario **no cambia de contrato**. El bot importa `parseVoz` y `categorias` desde `api/src/` (mismo repo). No se reimplementa el diccionario.

```
Celular WhatsApp
    → WAHA existente (https://waha.vowtech.lat, sesión `insumos`)
         webhook HTTPS
    → bot (mismo compose que la API)
         parseVoz / zonas / (si hace falta) MiniMax
         GET http://api:3000/api/consultar
         POST https://waha.vowtech.lat/api/sendText
    → respuesta al celular
```

| Servicio | Dónde | Persistencia |
|----------|-------|--------------|
| **api** | compose `api-persistente` | Volumen `acopio_data` — **no renombrar** |
| **waha** | proyecto Dokploy **WAHA** (`waha.vowtech.lat`) | Sus volúmenes `waha_sessions` / `waha_media`. No tocarlos desde este repo. |
| **bot** | mismo compose que `api` | Estado 15 min en memoria |

El bot llama a `WAHA_BASE=https://waha.vowtech.lat` con `WAHA_API_KEY` (la del proyecto WAHA). Sesión `WAHA_SESSION=insumos` para no pisar otras apps.

Webhook: Traefik en `insumos.vowtech.lat` path `/wa-hook` → bot `:3001` (`stripPath` off; el server acepta `/wa-hook` y `/webhook`). La sesión `insumos` se configura con `url: https://insumos.vowtech.lat/wa-hook` y `events: ["message"]`. Si hay `WEBHOOK_SECRET`, el bot exige el header `X-Webhook-Secret`.

### QR (una vez)

El dashboard ya está en `https://waha.vowtech.lat`. Escanear el QR de la sesión **insumos** ahí. No publicar otro dashboard ni otro contenedor WAHA.

### Compose

Extender `docker-compose.prod.yml` **solo con `bot`**. No hay servicio `waha` aquí.

El bot recibe por env:

- `API_BASE=http://api:3000`
- `WAHA_BASE=https://waha.vowtech.lat`
- `WAHA_API_KEY` (secret del proyecto WAHA)
- `WAHA_SESSION=insumos`
- `WEBHOOK_SECRET` (opcional)
- `LLM_*` (arriba)
- `PUBLIC_WEB=https://insumos.vowtech.lat`

La API recibe `WHATSAPP_PUBLIC_NUMBER` (dígitos, sin `+`) para `/api/salud`.

---

## PWA

`GET /api/salud` incluye `whatsapp: "57…"` o `whatsapp: null` (env `WHATSAPP_PUBLIC_NUMBER` en la API). La home y la lista muestran **Escribir por WhatsApp** → `https://wa.me/<número>?text=Hola` solo si el campo no es null. Así se cambia el chip sin redeployar estáticos.

---

## Seguridad y límites

- Rate limit del bot: **20 mensajes por número de WhatsApp por hora**. Respuesta: «Demasiadas consultas. Prueba en un rato o mira el mapa.»
- No persistir PII (teléfono, texto del chat) en SQLite. Logs del bot: sin número completo (últimos 4) y sin cuerpo de mensaje en producción.
- API key de WAHA y MiniMax solo en secrets de Dokploy.
- El bot no acepta webhooks desde fuera de la red Docker (no hay dominio del bot).
- Idempotencia de respuesta: si WAHA reentrega el mismo `message.id`, no se vuelve a consultar ni a responder.

---

## Errores

| Fallo | Qué ve la persona |
|-------|-------------------|
| Sin categoría / zona | Pregunta corta (tabla de conversación). |
| MiniMax caído o sin key | Pregunta a palo seco. El bot no se cae. |
| API sin puntos / sin stock | «No hay … registrados» + mapa. |
| API caída | «No pude consultar el inventario. Mira el mapa: https://insumos.vowtech.lat» |
| WAHA desconectado | El usuario no recibe nada. Alerta operativa (log + `/salud` del bot `waha: down`). |
| Mensaje duplicado | Silencio (ya se respondió). |

---

## Pruebas

El diálogo y el router se prueban **sin** WhatsApp real.

| Capa | Qué |
|------|-----|
| `matchZona` | Alias, tildes, “la virginia”, desconocido → null. |
| `interpretar` | “dónde hay pañales” → `ninos`; “cobijas en Cuba” → categoria+zona; “hola” → ayuda. |
| Plantilla | 0 puntos, 1 punto, 3 puntos; links maps + ficha; no más de 3. |
| Router LLM | Fake provider en test: se llama solo si reglas fallan; JSON inválido → preguntar. |
| Webhook | Fixture de mensaje WAHA → llama consultar (mock) → payload de envío. |
| Rate limit / idempotencia | 21.er mensaje; mismo `message.id` dos veces. |

No se mockea MiniMax en CI salvo un contrato del adaptador (URL, headers, `thinking.disabled`). No hay prueba E2E de QR en CI.

Criterio de listo (manual): desde un celular ajeno, «dónde hay comida» → al menos un punto con stock de comida (o “no hay registrados”) y un link para llegar.

---

## Criterio de listo

- [ ] Bot habla con el WAHA existente (`waha.vowtech.lat`), sesión `insumos` persistente. Sin desplegar otro WAHA.
- [ ] Webhook de texto → interpretar → consultar → respuesta ≤ 3 puntos.
- [ ] Conversación de seguimiento (categoría o zona que faltaba).
- [ ] MiniMax solo como fallback; se puede apagar sin romper el bot.
- [ ] Audio pide texto (no STT).
- [ ] `wa.me` visible en la PWA si hay número.
- [ ] Issue #1 se puede cerrar cuando esto esté en producción; STT no bloquea el cierre.

---

## Future

1. `SttRouter` + Whisper (`POST /v1/audio/transcriptions`, `whisper-1`, `language=es`) para notas de voz.
2. Pin de ubicación de WhatsApp → `lat`/`lng`/`radio`.
3. Cloud API si Meta tumba la sesión no oficial.
4. Registrar stock por WhatsApp (voluntarios), con autenticación.
5. Más de un número.
