# Insumos Pereira

PWA para inventariar insumos de ayuda en Pereira. HTML nativo, mapa, GPS, botones + voz. API Node + SQLite.

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

El bot (`bot/`) llama al **WAHA ya desplegado** en `https://waha.vowtech.lat` (sesión `insumos`). No hay servicio `waha` en este repo.

Webhook público (Dokploy domain path, Strip Path **off**, service `bot`, puerto 3001):

`https://insumos.vowtech.lat/wa-hook`

En el dashboard WAHA, sesión `insumos`: `url: https://insumos.vowtech.lat/wa-hook`, `events: ["message"]`. Si `WEBHOOK_SECRET` está set, WAHA debe enviar el header `X-Webhook-Secret`. QR en `https://waha.vowtech.lat`.

### Variables de entorno (bot)

| Variable | Valor prod | Notas |
|----------|------------|--------|
| `PORT` | `3001` | Interno; solo `expose` |
| `API_BASE` | `http://api:3000` | DNS del compose |
| `PUBLIC_WEB` | `https://insumos.vowtech.lat` | Links de ficha |
| `WAHA_BASE` | `https://waha.vowtech.lat` | Cliente; no un segundo WAHA |
| `WAHA_API_KEY` | secret | Mismo key del proyecto WAHA |
| `WAHA_SESSION` | `insumos` | No pisar otras apps |
| `WEBHOOK_SECRET` | secret (opcional) | Header `X-Webhook-Secret` |
| `LLM_PROVIDER` | `minimax` | Fallback si las reglas no entienden |
| `LLM_BASE_URL` | `https://api.minimax.io/v1` | |
| `LLM_MODEL` | `MiniMax-M3` | |
| `LLM_API_KEY` | secret | Sin key: pregunta a palo seco |

La API puede recibir `WHATSAPP_PUBLIC_NUMBER` (dígitos, sin `+`) para el botón `wa.me` en la PWA.

## Dokploy

Un proyecto **Insumos Pereira**, dos Applications, dominio **insumos.vowtech.lat**:

1. **web** — Static, build path `/public`, host `insumos.vowtech.lat`, path `/`, puerto 80.
2. **api** — Compose `docker-compose.prod.yml` (volumen `acopio_data` → `/data`; **no** renombrar). Mismo host:
   - path `/api` → service `api`, puerto 3000, Strip Path off
   - path `/wa-hook` → service `bot`, puerto 3001, Strip Path off
   El `/api` tiene que existir en **cada** host de la web; si no, el mapa sale vacío y crear dice “sin red”.
   WAHA no se despliega aquí: el bot llama a `https://waha.vowtech.lat` sesión `insumos`.

No publiques puertos Docker a `0.0.0.0`. El bot solo tiene `expose: "3001"`.

## Spec

`docs/superpowers/specs/2026-08-16-acopio-pereira-design.md`  
`docs/superpowers/specs/2026-08-17-whatsapp-bot-design.md`
