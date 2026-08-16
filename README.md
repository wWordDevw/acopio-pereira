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

## Dokploy

Un proyecto **Insumos Pereira**, dos Applications, dominio **insumos.vowtech.lat**:

1. **web** — Static, build path `/public`, host `insumos.vowtech.lat`, path `/`, puerto 80.
2. **api** — Compose `docker-compose.prod.yml` (volumen `acopio_data` → `/data`). Mismo host, path `/api`, Strip Path off, puerto 3000, service `api`. Sin esto el SQLite se borra en cada deploy. El `/api` tiene que existir en **cada** host de la web; si no, el mapa sale vacío y crear dice “sin red”.

No publiques puertos Docker a `0.0.0.0`.

## Spec

`docs/superpowers/specs/2026-08-16-acopio-pereira-design.md`
