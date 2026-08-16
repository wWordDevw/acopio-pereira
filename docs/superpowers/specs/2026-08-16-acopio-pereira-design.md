# Acopio Pereira — spec de diseño

**Fecha:** 2026-08-16  
**Producto:** PWA ultraligera para inventariar insumos de ayuda en puntos de acopio de Pereira.  
**Estado:** aprobado en brainstorming; implementación + deploy Dokploy.

---

## Contexto

Tras el sismo hay donaciones llegando a iglesias, canchas y casas. Hay que saber **dónde** hay cosas y **cuánto** queda, con el celular, sin instalar app y sin cuentas.

Ámbito V1: **área metropolitana de Pereira** (caja geográfica Pereira / Dosquebradas / La Virginia).

---

## Decisiones

| Tema | Decisión |
|------|----------|
| App | Nueva. No es un módulo de Salvo Pereira. |
| Quién escribe | Cualquiera. GPS preciso o pin en el mapa. Sin cuenta, sin PIN. |
| Registro | Botones grandes por categoría (toque = +1) + micrófono (voz). |
| Inventario | Entrada y salida. Stock = SUM(entra) − SUM(sale). |
| Front | HTML nativo + CSS propio + JS mínimo. Sin React, sin Tailwind, sin CDN de app. Leaflet vendorizado. |
| Datos | SQLite en el VPS. SQL a mano. Sin Prisma. |
| Deploy | Dokploy, un proyecto, dos Applications (web Static + api Dockerfile). |
| Voz | Web Speech API en el teléfono. Categorización por reglas en el servidor. Sin LLM. |
| Mapa | Leaflet + teselas OpenStreetMap. Centro Pereira (4.8133, −75.6961). |

---

## Fuera de V1

Cuentas, PIN, fotos, “se necesita”, otras ciudades, app nativa, editar/borrar punto, chat, multi-idioma, modelo de IA.

---

## Arquitectura

```text
teléfono                         Dokploy
────────                         ───────
HTML + SW (cache-first cascarón)
Leaflet local + teselas OSM
        │
        ▼
   GET/POST /api/…  ──────────►  api (Node + better-sqlite3)
                                 /data/acopio.sqlite
```

El cascarón se abre sin red. **Crear punto y movimientos requieren señal** (el inventario vive en el servidor).

### Servicios Dokploy

| Application | Build type | Notas |
|-------------|------------|--------|
| `web` | `static` | Build path `/public`. `isStaticSpa` = false. Puerto 80. |
| `api` | `dockerfile` | `api/Dockerfile`, context `api`. Puerto 3000. Env `PORT`, `SQLITE_PATH`, `TRUST_PROXY=1`. |

Mismo host, path `/` para web y `/api` para la API, Strip Path **off**. HTML llama rutas relativas `/api/...`.

Puertos Docker **no** se publican a `0.0.0.0`. Traefik termina HTTPS.

---

## Front

Presupuesto: cascarón chico. CSS en `public/css/app.css`. Sin `style=""` en HTML. Enlaces con `.html`.

| Ruta | Archivo | Qué hace |
|------|---------|----------|
| `/` | `index.html` | Mapa de puntos + crear + ir a lista |
| `/crear.html` | `crear.html` | GPS o pin + nombre + nota |
| `/punto.html` | `punto.html` | Ficha, inventario, entra/sale, voz |
| `/lista.html` | `lista.html` | Lista sin mapa |
| `/offline.html` | `offline.html` | Fallback SW |

### Categorías (orden de botones)

`agua`, `comida`, `medicinas`, `cobijas`, `ropa`, `higiene`, `ninos`, `mascotas`, `otro`.

Etiquetas: Agua, Comida, Medicinas, Cobijas, Ropa, Higiene, Niños, Mascotas, Otro.

Toque = cantidad 1. Botón **+5** al lado de cada categoría. Interruptor **Entra / Sale**. Micrófono dicta texto y `POST` con `{ tipo, texto }`.

Salida no deja stock negativo: si piden más de lo que hay, se descuenta lo disponible y la API marca `ajustado: true`. Si hay 0, `400 sin_stock`.

---

## Voz

El navegador transcribe. El servidor parsea:

- Parte por `y`, comas y punto y coma.
- Cantidad: dígitos o palabras (uno…veinte, treinta…cien). Default 1.
- Categoría por palabras clave (cobija, atún, pañal, suero, kit de aseo…). Si no hay match: `otro`.

---

## API

| Método | Ruta | Cuerpo / query |
|--------|------|----------------|
| `GET` | `/api/salud` y `/api/health` | `{ ok: true }` |
| `GET` | `/api/puntos` | Lista + stock resumido |
| `GET` | `/api/puntos/:id` | Ficha + inventario + últimos 30 movimientos |
| `POST` | `/api/puntos` | `{ nombre, lat, lng, nota?, idempotency_key }` |
| `POST` | `/api/puntos/:id/movimientos` | `{ tipo, categoria?, cantidad?, texto?, idempotency_key }` |

`tipo`: `entra` \| `sale`. Si viene `texto`, se parsea y puede crear varios movimientos. Si vienen botones: `categoria` + `cantidad`.

Idempotencia: misma `idempotency_key` → 200 y el recurso existente.

Errores: `400` validación, `404` no encontrado, `429` rate limit. JSON corto `{ error }`.

---

## Datos

Archivo: `/data/acopio.sqlite` (WAL). Migración `api/sql/001_init.sql` al arrancar.

- `puntos`: id, nombre (2–80), nota (≤200 o null), lat, lng, idempotency_key unique, created_at, updated_at.
- `movimientos`: id, punto_id, tipo, categoria, cantidad (≥1), texto_original, idempotency_key unique, created_at.
- `rate_limits`: clave, ventana, conteo.

Caja geográfica: lat 4.70–5.05, lng −75.90–−75.50.

---

## Seguridad

- Sin auth. Rate limit por IP hasheada: **30 POST /puntos por hora**, **60 POST movimientos por minuto**.
- Nombre y nota: recortar; rechazar URLs (`http`, `https`, `www.`, `bit.ly`, `t.co`).
- Front pinta con `textContent`, nunca `innerHTML` de datos del servidor.
- No se guardan IP en tablas públicas.

---

## Offline / PWA

- Manifest + iconos 192/512 + maskable.
- SW cache-first del cascarón (HTML, CSS, JS, Leaflet, iconos).
- `/api/*` network-only.
- `sw.js` y HTML con `no-cache` de intención (no immutable).

---

## Criterio de éxito

- En un Android se ve el mapa de Pereira y se crea un punto con GPS en menos de 30 s.
- Un voluntario suma cobijas con un toque o con voz y el stock se refleja en el mapa.
- Entregar no deja números negativos.
- Deploy Dokploy en verde, health 200, sin errores en logs de arranque.

---

## Repo

```text
acopio-pereira/
├── docs/superpowers/specs/2026-08-16-acopio-pereira-design.md
├── public/          # Application web
├── api/             # Application api
└── docker-compose.yml   # solo local, loopback
```
