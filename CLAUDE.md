# Insumos Pereira — notas para agentes

PWA + API de inventario de insumos en Pereira. No es un módulo de Salvo.
Repo: `wWordDevw/acopio-pereira`. Nombre visible: **Insumos Pereira**.
Producción: **https://insumos.vowtech.lat** — web `/` y API `/api` en el mismo host.
Volumen SQLite: `acopio_data` / `/data/acopio.sqlite` — **no renombrar** o se pierde la DB.

Bot WhatsApp V1: **solo texto**. Reusa WAHA existente `https://waha.vowtech.lat` (proyecto Dokploy WAHA, compose `waha-hqxniz`). **No** desplegar un segundo WAHA ni volumen `waha_sessions` aquí. Sesión por env **`WAHA_SESSION`** (sin default en código). QR en el dashboard existente (`https://waha.vowtech.lat`). MiniMax-M3 solo si `parseVoz`/zonas no entienden. Sin STT / audio. Webhook `https://insumos.vowtech.lat/wa-hook`.

Transporte WhatsApp intercambiable vía `WHATSAPP_PROVIDER` (`waha` | `meta`; default `waha`). Cloud API listo por env (`META_*`); no hace falta tocar Traefik ni el path `/wa-hook`.

## TODO

- [ ] **Bot WhatsApp con WAHA** — la gente escribe y el bot dice **qué hay y a dónde ir**.
  - Issue: https://github.com/wWordDevw/acopio-pereira/issues/1
  - Usar `GET /api/consultar` + categorías existentes (`parse-voz`).
  - Reusa `https://waha.vowtech.lat`. Sesión = `WAHA_SESSION` en Dokploy (no hardcode). No segundo WAHA. QR en el dashboard existente.
  - V1: solo consulta por texto (no registrar stock; no STT).
  - Publicar `wa.me` en la PWA cuando esté vivo.
  - Cerrar el issue cuando el criterio de listo esté en prod.
