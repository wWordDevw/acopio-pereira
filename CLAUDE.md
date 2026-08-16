# Insumos Pereira — notas para agentes

PWA + API de inventario de insumos en Pereira. No es un módulo de Salvo.
Repo: `wWordDevw/acopio-pereira`. Nombre visible: **Insumos Pereira**.
Volumen SQLite: `acopio_data` / `/data/acopio.sqlite` — **no renombrar** o se pierde la DB.

## TODO

- [ ] **Bot WhatsApp con WAHA** — la gente escribe o habla y el bot dice **qué hay y a dónde ir**.
  - Issue: https://github.com/wWordDevw/acopio-pereira/issues/1
  - Usar `GET /api/consultar` + categorías existentes (`parse-voz`).
  - WAHA en Dokploy sin puertos públicos; sesión persistente (QR no se puede perder en cada deploy).
  - V1: solo consulta (no registrar stock por WhatsApp).
  - Publicar `wa.me` en la PWA cuando esté vivo.

Cuando se implemente, cerrar el issue y marcar este checkbox.
