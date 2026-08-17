# Insumos Pereira — órdenes de lote (entrada y salida)

**Fecha:** 2026-08-17  
**Producto:** PWA + API de inventario de insumos en Pereira.  
**Issue:** https://github.com/wWordDevw/acopio-pereira/issues/3  
**Estado:** diseño de brainstorming; pendiente de aprobación del spec escrito.

---

## Contexto

Hoy cada toque o dictado crea **movimientos sueltos** (`entra` / `sale` por categoría o producto). El stock es `SUM(entra) − SUM(sale)`. Eso responde “¿cuánto hay de X?”.

En el acopio la realidad es otra: a las 13:12 llega una donación (un costal, una camioneta, una caja) con varios ítems y a veces una foto del lote. Más tarde se quiere **volver a esa orden**, no a un pañal suelto de hace tres días. La orden responde “¿qué llegó (o salió) en *esta* donación y con qué evidencia?”.

El catálogo de productos, la foto de SKU y el filtro por categoría **ya existen** (PR #4). Esta spec es **solo el sobre de lote**.

Ámbito: misma PWA móvil (~390px primero), sin cuentas, mismo host `https://insumos.vowtech.lat`.

---

## Decisiones

| Tema | Decisión |
|------|----------|
| Caminos de registro | **Dos.** El +1/−1 y el dictado instantáneo **se quedan**. Se agrega “Registrar lote” aparte. |
| Tipo de lote | **Entrada y salida.** Un lote es todo `entra` o todo `sale`. No se mezclan. |
| Ciclo de vida | **Un POST atómico** al confirmar. No hay orden abierta en SQLite. |
| Borrador | Solo en el celular. Cerrar / atrás / recargar con líneas o foto → “¿Descartar este lote?”. |
| Tras confirmar | **Fija.** No editar, no anular. Corregir = movimiento suelto o lote en sentido contrario. |
| Stock | No vive en la orden. Al confirmar se escriben `movimientos` normales. Fórmula igual que hoy. |
| Foto del lote | Opcional. Mismo volumen `/data/fotos` que las fotos de producto. No es la foto del SKU. |
| Hora | Reloj local, no “hace X min”. Lote: `abierta_at` (cuando se abrió el panel). Suelto: `created_at` del movimiento. Lista del día: columna `dia` que manda el teléfono (`YYYY-MM-DD` local). |
| Identidad | Sin cuentas. Rate limit e idempotencia como el resto de la API. |
| Bot WhatsApp | No lista órdenes. Sigue consultando stock. |

---

## Fuera de V1

- Anular o editar una orden confirmada.
- Orden abierta persistida en el servidor (varios voluntarios retomando el mismo sobre).
- Facturación, proveedor formal, firma digital.
- Broadcast / WhatsApp de la orden.
- Foto por línea del lote (si el producto del catálogo ya tiene foto, se muestra en la ficha).
- Reescribir el stock para que “viva” en la orden.
- Historial de órdenes más allá del día pedido por query (la API filtra por `dia`; no hay calendario de meses en la PWA).

---

## Experiencia en el celular

La gente usa esto **en el celular**, en la calle o en el acopio. Diseñar y verificar primero a ~390px. Botones grandes; nada que dependa de hover.

### Ficha del punto (`punto.html`)

El panel **Registrar insumos** no cambia de contrato: Entra/Sale, categoría → producto, +1/+5, crear producto, dictar. Cada toque hace `POST /api/puntos/:id/movimientos` al instante.

Debajo (misma zona de acciones) hay un segundo botón grande: **Registrar lote**. Abre un panel distinto.

### Panel del lote

1. Interruptor **Entra / Sale** — fija el tipo de todo el sobre.
2. Hora visible al abrir: “Lote de las 13:12” (hora local del teléfono). Ese instante se guarda como `abierta_at` y no se cambia si tardan en confirmar.
3. Lista de **líneas** (producto o categoría “sin detalle” + cantidad). Se reutiliza el picker existente: categoría → producto, +1/+5, crear producto, dictar y revisar. Cada toque **suma a la lista local**, no llama a la API de movimientos.
4. **Foto del lote** opcional (`input file` + `capture="environment"`). Se puede quitar antes de confirmar. Es la foto del costal / la mesa.
5. **Confirmar lote** — único `POST` del flujo. Si hay 0 líneas, no envía: aviso “Agrega al menos un insumo”.
6. Toast de éxito: “Entraron 38 en el lote de las 13:12.” (o “Salieron…”).

### Descarte

Si el panel se cierra, hay recarga, o el usuario intenta irse con líneas o foto en el borrador: diálogo **“¿Descartar este lote?”**. Sí tira el borrador; No se queda en el panel.

Fallo de red al confirmar: el borrador se conserva. Pueden reintentar. Si el POST sí llegó y no vieron la respuesta, la misma `idempotency_key` evita duplicar stock.

### Consultar órdenes

Otro control en la ficha (botón o `<details>` bajo el inventario): **órdenes del punto en el día local del teléfono**.

Cada fila: hora de reloj, Entra/Sale, resumen (“3 ítems · 38 und.”), miniatura si hay foto. Tocar abre la **ficha de la orden**: hora, tipo, nota si la hubo, foto grande, líneas (nombre, cantidad, foto de catálogo si existe). Sin botones de editar.

### Horas en insumos sueltos

`formatWhen` deja de usar “hace 12 min” / “hace 2 h”. Formato único, hora local:

- Hoy: `13:12`
- Otro día: `16 ago · 13:12`

Se aplica a:

- Cada fila de **Últimos movimientos** (`created_at`).
- Cada fila de la lista de órdenes (`abierta_at`).
- La ficha del lote (`abierta_at`).

Si un movimiento tiene `orden_id`, la fila lleva un chip **“Lote 13:12”** que abre esa ficha.

El bloque **Hay aquí** (stock agrupado) no lleva hora: es un total, no un evento.

---

## Datos

Migración `api/sql/003_ordenes.sql`, aplicada al arrancar igual que `002_productos.sql` (`openDb` → `migrateOrdenes`). El archivo SQLite sigue en `/data/acopio.sqlite`. **No renombrar** el volumen.

### `ordenes`

```sql
create table if not exists ordenes (
  id text primary key,
  punto_id text not null references puntos(id),
  tipo text not null check (tipo in ('entra', 'sale')),
  abierta_at text not null,
  dia text not null check (length(dia) = 10),
  cerrada_at text not null default (datetime('now')),
  nota text check (nota is null or length(nota) <= 200),
  foto_path text,
  idempotency_key text not null unique
);

create index if not exists ordenes_punto_dia
  on ordenes (punto_id, dia, abierta_at desc);
```

`dia` es el día civil del teléfono al abrir el panel (`YYYY-MM-DD`, p. ej. `2026-08-17`). Así un lote abierto a las 20:00 en Pereira no “se pasa” al día siguiente por guardarse en UTC.

No hay fila con `cerrada_at` null. Confirmar **es** insertar.

### `movimientos.orden_id`

```sql
alter table movimientos add column orden_id text references ordenes(id);
```

Nullable. Movimientos viejos y el +1 suelto quedan en `null`. Índice opcional `(orden_id)` para armar la ficha.

### Foto

Mismo directorio que productos (`db.fotosDir`, en prod `/data/fotos`). Nombre `orden-{id}.jpg` / `.png` / `.webp`. Límites iguales a producto: 8–800_000 bytes, mime `image/jpeg` | `image/png` | `image/webp`.

---

## API

Sin auth. JSON. Errores `{ error }`. CORS GET como hoy. `POST` de orden entra en el rate limit de movimientos: **60 por minuto por IP hasheada**.

### `POST /api/puntos/:id/ordenes`

Crea la orden y sus movimientos en **una transacción**. Si algo falla, no queda orden ni movimiento.

Cuerpo:

```json
{
  "tipo": "entra",
  "abierta_at": "2026-08-17T18:12:00.000Z",
  "dia": "2026-08-17",
  "nota": null,
  "lineas": [
    { "producto_id": "<uuid>", "cantidad": 20 },
    { "categoria": "higiene", "cantidad": 8 }
  ],
  "foto": { "imagen_base64": "…", "mime": "image/jpeg" },
  "idempotency_key": "<uuid>"
}
```

- `tipo`: `entra` | `sale`.
- `abierta_at`: ISO-8601 parseable; la PWA manda el instante en que se abrió el panel (UTC).
- `dia`: `YYYY-MM-DD` del reloj local del teléfono al abrir el panel. Obligatorio. La lista del día filtra por esta columna (no por la fecha UTC de `abierta_at`).
- `lineas`: 1–30. Cada línea tiene `producto_id` (UUID de catálogo; la categoría se toma del producto) **o** `categoria` (slug válido) sin producto. `cantidad` entero 1–999.
- `nota`: opcional, mismas reglas que nota de punto (≤200, sin URL).
- `foto`: opcional; mismas reglas que `validateFoto` de producto.
- `idempotency_key`: UUID. Replay → `200` y la orden existente, sin insertar otra vez.

`201` si se creó. Respuesta:

```json
{
  "id": "…",
  "nombre": "…",
  "inventario": [],
  "orden": { "id": "…", "tipo": "entra", "abierta_at": "…", "cerrada_at": "…", "lineas": [], "foto": "/api/ordenes/:id/foto" },
  "aplicados": [],
  "movimientos": []
}
```

(`publicPunto` fresco + `orden` + `aplicados` + últimos movimientos, el mismo shape que el POST de movimiento para que `paint()` pueda reutilizar inventario.)

### `GET /api/puntos/:id/ordenes?dia=YYYY-MM-DD`

`dia` obligatorio (`YYYY-MM-DD`). Devuelve las órdenes de ese punto con `ordenes.dia` igual a la query. El servidor no convierte timezones.

Lista: id, tipo, `abierta_at`, `dia`, conteo de líneas, suma de cantidades, `foto` URL o null. Orden: `abierta_at` desc.

### `GET /api/ordenes/:id`

Ficha pública: cabecera + líneas (categoria, etiqueta, producto_id, nombre, cantidad, foto de catálogo si hay) + `foto` del lote.

### `GET /api/ordenes/:id/foto`

Bytes de la foto del lote. 404 si no hay. Mismos mime y cache que foto de producto.

### `GET /api/puntos/:id` (cambio menor)

Cada movimiento público incluye `created_at`, `orden_id` (`string` o `null`) y, si hay lote, `orden_abierta_at` (para el chip **“Lote 13:12”** sin un GET extra). El join es `movimientos.orden_id → ordenes.abierta_at`.

No hay `PATCH`, `DELETE` ni “abrir/cerrar” de orden.

OpenAPI (`api/src/openapi.js`) y el índice `GET /api` documentan las rutas nuevas.

---

## Flujo de datos

```text
celular                              api
───────                              ───
Registrar insumos  → POST /movimientos     → 1..n filas, orden_id null
                                             stock cambia ya

Registrar lote
  [borrador en memoria]
  Confirmar        → POST /puntos/:id/ordenes
                       transacción:
                         insert orden
                         write foto si vino
                         insert movimientos (orden_id)
                       stock = SUM entra − SUM sale

Consultar órdenes  → GET /puntos/:id/ordenes?dia=
Ficha              → GET /ordenes/:id
Chip “Lote 13:12”  → GET /ordenes/:id
```

Sale en lote: por cada línea, la misma regla que `insertMovimientos` hoy. Si una línea no tiene stock → `400 sin_stock` y **rollback de toda la transacción** (no queda orden a medias). Si piden de más → se recorta esa línea y va `ajustado: true` en `aplicados`.

---

## Validación y errores

| Caso | Respuesta |
|------|-----------|
| Punto u orden inexistente | `404 no_encontrado` |
| Tipo inválido | `400 tipo_invalido` |
| 0 líneas o más de 30 | `400 items_invalidos` |
| Cantidad fuera de 1–999 | `400 cantidad_invalida` |
| Categoría / producto inválido | `400 categoria_invalida` / `producto_invalido` |
| `abierta_at` no ISO parseable | `400 fecha_invalida` |
| `dia` que no sea `YYYY-MM-DD` | `400 dia_invalido` |
| Nota con URL o demasiado larga | `400 nota_invalida` / `url_no_permitida` |
| Foto ilegible | `400 foto_invalida` |
| Foto fuera de 8–800_000 bytes | `400 foto_grande` |
| Sale y esa línea tiene stock 0 | `400 sin_stock` (nada persistido) |
| Sale y piden de más | 201, línea recortada, `ajustado: true` |
| Replay de `idempotency_key` | `200` + orden existente |
| Rate limit | `429 rate_limit` |

La foto inválida o grande **no** crea la orden.

---

## Front — archivos

Sin React, sin Tailwind, sin `style=""` en HTML. CSS en `public/css/app.css`. El cascarón sigue en cache-first; `/api/*` network-only. Subir versión de `sw.js` para invalidar el HTML/JS tocado.

| Archivo | Cambio |
|---------|--------|
| `public/punto.html` | Botón Registrar lote, panel de borrador, lista/ficha de órdenes del día. El panel de insumos sueltos se queda. |
| `public/js/punto.js` | Estado de borrador, confirmación de descarte, confirm de lote, lista del día, ficha, chip en movimientos. |
| `public/js/api.js` | `postOrden`, `listOrdenes`, `getOrden`. |
| `public/js/categorias.js` | `formatWhen` a reloj local (`13:12` / `16 ago · 13:12`). |
| `public/css/app.css` | Panel de lote, filas de orden, chip, ficha. Tokens existentes. |
| `public/sw.js` | Cache bust. |

Páginas que no cambian de comportamiento: mapa, crear, lista. `formatWhen` sí cambia en cualquier sitio que lo use (meta “Creado …” del punto): pasa a reloj, coherente.

---

## Criterio de listo

Desde un celular (~390px), en un punto:

1. Abrir **Registrar lote** (entrada) a una hora HH:MM, cargar 3 productos, una foto del costal, confirmar.
2. En **órdenes de hoy** se ve esa hora, los 3 ítems y la foto.
3. El stock del punto sube **igual** que si se hubiera tocado +1 tres veces (o las cantidades equivalentes).
4. Un +5 suelto sigue grabando al instante y en **Últimos movimientos** muestra `13:12` (no “hace 3 min”). Si ese movimiento no es de lote, no lleva chip.
5. Abrir un lote, cargar 2 líneas, tocar cerrar → pregunta descarte. Cancelar deja el borrador; aceptar lo tira. El stock no se movió.
6. Un lote de salida sin stock de esa línea → error, sin orden.

---

## Pruebas

API con `node --test` (mismo estilo que `api/test/productos.test.js` y `server.test.js`):

1. POST lote de 3 líneas `entra` → stock sube como 3 movimientos; `GET /api/ordenes/:id` trae hora, líneas y foto.
2. `GET /api/puntos/:id/ordenes?dia=` incluye esa orden; otro `dia` no.
3. Replay de la key: no duplica stock ni filas.
4. Sale sin stock: `400 sin_stock`, cero orden, stock intacto.
5. Movimiento suelto: `orden_id` null; `created_at` viaja en `GET /api/puntos/:id`.
6. Validación: 0 líneas, foto grande, tipo malo.

La PWA se verifica a mano en viewport ~390px (flujo lote, lista del día, hora en sueltos, toque instantáneo intacto). Desktop es secundario.

---

## Relacionado

- Issue #3: https://github.com/wWordDevw/acopio-pereira/issues/3
- Catálogo + foto de producto: PR #4 (ya en `main`).
- Bot WhatsApp: no consume esta API en V1.
