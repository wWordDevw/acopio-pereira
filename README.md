# Insumos Pereira

PWA para inventariar insumos de ayuda en Pereira. HTML nativo, mapa, GPS, botones + voz. API Node + SQLite.

En la ficha de un punto: toca una categoría (Niños, Mascotas…) y salen los **productos** de esa categoría. Puedes crear uno nuevo (ej. pasta) si no está; el servidor evita duplicados (pañal ≈ pañales). Foto opcional por producto. Semilla alineada con las necesidades reales de Unidos por Pereira.

Producción: **https://insumos.vowtech.lat** (mapa, ficha y API `/api`).

## Local

```bash
cd api && npm ci && npm test && npm start
```

API en `http://127.0.0.1:3000`. En otra terminal:

```bash
cd public && python3 -m http.server 4173
```

O con Docker (loopback):

```bash
docker compose up --build
```

El HTML llama `/api/...` en el mismo origen.

## API pública (para otros devs)

Documentación interactiva (Swagger UI):

- Local: `http://127.0.0.1:3000/api/docs`
- OpenAPI: `GET /api/openapi.json`
- Consulta rápida: `GET /api/consultar?q=cobijas`

Ejemplos:

```bash
curl http://127.0.0.1:3000/api/consultar?q=agua
curl 'http://127.0.0.1:3000/api/puntos?lat=4.8133&lng=-75.6961&radio=3'
curl http://127.0.0.1:3000/api/puntos
```

GET tiene CORS `*`. Sin API key. Detalle de errores, categorías y rate limits está en Swagger.

## Bot WhatsApp

El bot (`bot/`) usa un transporte intercambiable. Por defecto es **WAHA** (`WHATSAPP_PROVIDER=waha`) contra el WAHA ya desplegado en `https://waha.vowtech.lat`. No hay servicio `waha` ni contenedor Meta en este repo. El nombre de sesión **no va en el código**: se pone `WAHA_SESSION` en el Environment de Dokploy (hoy la sesión viva se llama `JJ`).

Para pasar a **WhatsApp Cloud API**, setear `WHATSAPP_PROVIDER=meta` y las cuatro `META_*` obligatorias (`META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`, `META_VERIFY_TOKEN`, `META_APP_SECRET`). Misma URL de webhook en ambos proveedores.

Webhook público (Dokploy domain path, Strip Path **off**, service `bot`, puerto 3001):

`https://insumos.vowtech.lat/wa-hook`

En el dashboard WAHA, la sesión cuyo nombre coincide con `WAHA_SESSION`: `url: https://insumos.vowtech.lat/wa-hook`, `events: ["message"]`. Si `WEBHOOK_SECRET` está set, WAHA debe enviar el header `X-Webhook-Secret`. QR en `https://waha.vowtech.lat`.

Con Meta, el callback de la app es el mismo: `https://insumos.vowtech.lat/wa-hook` (GET verify + POST con HMAC).

Plantilla para local y Dokploy: `.env.example` (copiar a `.env`; no commitear secretos).

### Variables de entorno (bot)

| Variable | Valor prod | Notas |
|----------|------------|--------|
| `PORT` | `3001` | Interno; solo `expose` |
| `API_BASE` | `http://api:3000` | DNS del compose |
| `PUBLIC_WEB` | `https://insumos.vowtech.lat` | Links de ficha |
| `WHATSAPP_PROVIDER` | `waha` | `waha` o `meta` |
| `WAHA_BASE` | `https://waha.vowtech.lat` | Cliente; no un segundo WAHA |
| `WAHA_API_KEY` | secret | Mismo key del proyecto WAHA |
| `WAHA_SESSION` | (Dokploy env, obligatorio) | Nombre exacto de la sesión en WAHA |
| `WEBHOOK_SECRET` | secret (opcional) | Header `X-Webhook-Secret` |
| `META_PHONE_NUMBER_ID` | (Dokploy, si meta) | |
| `META_ACCESS_TOKEN` | secret | |
| `META_VERIFY_TOKEN` | secret | Handshake GET |
| `META_APP_SECRET` | secret | HMAC `X-Hub-Signature-256` |
| `META_GRAPH_VERSION` | `v21.0` | opcional |
| `LLM_PROVIDER` | `minimax` | Fallback si las reglas no entienden |
| `LLM_BASE_URL` | `https://api.minimax.io/v1` | |
| `LLM_MODEL` | `MiniMax-M3` | |
| `LLM_API_KEY` | secret | Sin key: pregunta a palo seco |

La API recibe `WHATSAPP_PUBLIC_NUMBER` (dígitos, sin `+`) desde el Environment de Dokploy para el botón `wa.me` en la PWA. No hardcodear el chip en el repo.

## Dokploy

Un proyecto **Insumos Pereira**, dos Applications, dominio **insumos.vowtech.lat**:

1. **web** — Static, build path `/public`, host `insumos.vowtech.lat`, path `/`, puerto 80.
2. **api** — Compose `docker-compose.prod.yml` (volumen `acopio_data` → `/data`; **no** renombrar). Mismo host:
   - path `/api` → service `api`, puerto 3000, Strip Path off
   - path `/wa-hook` → service `bot`, puerto 3001, Strip Path off
   El `/api` tiene que existir en **cada** host de la web; si no, el mapa sale vacío y crear dice “sin red”.
   WAHA no se despliega aquí: el bot llama a `https://waha.vowtech.lat` con `WAHA_SESSION` del Environment.

No publiques puertos Docker a `0.0.0.0`. El bot solo tiene `expose: "3001"`.

## Spec

`docs/superpowers/specs/2026-08-16-acopio-pereira-design.md`  
`docs/superpowers/specs/2026-08-17-whatsapp-bot-design.md`  
`docs/superpowers/specs/2026-08-17-whatsapp-providers-design.md`
