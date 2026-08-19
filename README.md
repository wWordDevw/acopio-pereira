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

## Protocolo Cabuya

Insumos Pereira publica sus puntos en el [Protocolo Cabuya](https://cabuya.org)
0.1, para que otras apps del ecosistema puedan leerlos sin scraping.

- Manifiesto (L1): `GET /.well-known/cabuya.json`
- Feed de lugares (L2): `GET /api/cabuya/places.json`

`publisher_id` **insumos-pereira**, datos bajo **CC0-1.0**, con
`permitted_use` = display, aggregate, redistribute, ai_answer.

Reglas que el feed respeta y conviene no romper al tocarlo:

- Los valores de contacto **nunca** viajan (§7.2). El feed lleva
  `contact_available` y el enlace a la ficha; el teléfono se queda aquí.
- `last_updated` sale del dato más reciente, **nunca** de la hora de la
  petición (§3.1 lo llama anti-patrón «always-now»).
- `last_confirmed_at` solo se llena con un movimiento de inventario: editar un
  punto no es confirmarlo (CR-1). Sin movimientos va `null`, que es dato honesto.
- Solo se publican puntos cuya nota trae un tipo reconocido (Acopio o
  Albergue). Los registros de prueba no entran: §7.5 trata los lugares
  inventados como causal de suspensión del registro.

## Inventario

La bodega del detalle es una **rejilla, no una `<table>`**: la misma marcación
se reordena en pantalla angosta sin scroll horizontal.

El color solo significa **nivel de existencias** — agotado, poco, ok. La
categoría se distingue por posición y rótulo, nunca por tono; por eso ya no hay
un color por categoría.

El umbral vive en `productos.minimo`, editable por producto. Arranca con el
valor de su categoría (`api/src/minimos.js`): agua 50, comida 30, cobijas y
ropa e higiene 20, niños 15, medicinas y mascotas y otro 10.

Los productos agotados **siguen apareciendo en cero**. Es la información que le
dice a alguien que este punto necesita algo, y por eso la consulta de
inventario ya no los descarta. Quien solo quiera existencias positivas filtra
por `stock > 0`, como ya hacen `consultar.js` y el bot.

### Despliegue del front y caché

El service worker sirve los estáticos con **stale-while-revalidate** y la
navegación con **red primero**. Es decir: un despliegue se ve en la siguiente
carga sin que nadie tenga que acordarse de subir `CACHE` en `sw.js`.

Antes era cache-first sin revalidar, y por eso un cambio ya desplegado podía
quedar invisible: el navegador servía la copia vieja para siempre. Si tocas
`sw.js`, no vuelvas a esa estrategia.

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
