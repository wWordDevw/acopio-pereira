# Acopio Pereira

PWA para inventariar insumos de ayuda en puntos de acopio de Pereira. HTML nativo, mapa, GPS, botones + voz. API Node + SQLite.

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

## Dokploy

Un proyecto **Acopio Pereira**, dos Applications:

1. **web** — Static, build path `/public`, path `/`, puerto 80.
2. **api** — Dockerfile `api/Dockerfile`, context `api`, env `PORT=3000`, `SQLITE_PATH=/data/acopio.sqlite`, `TRUST_PROXY=1`, mismo host, path `/api`, Strip Path off, puerto 3000.

No publiques puertos Docker a `0.0.0.0`.

## Spec

`docs/superpowers/specs/2026-08-16-acopio-pereira-design.md`
