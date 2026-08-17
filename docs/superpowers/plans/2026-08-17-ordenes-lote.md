# Órdenes de lote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupar donaciones (y salidas) en una orden con hora de reloj y foto opcional del lote, sin quitar el +1 suelto, y sin cambiar la fórmula de stock.

**Architecture:** Un `POST /api/puntos/:id/ordenes` atómico crea la fila `ordenes` y los `movimientos` (con `orden_id`) en la misma transacción. El borrador vive solo en el celular. `GET` lista por `dia` civil que manda el teléfono. La PWA suma un panel “Registrar lote” al lado del registro instantáneo y pinta horas de reloj en sueltos y lotes.

**Tech Stack:** Node 22, `better-sqlite3`, `node:http`, `node:test`. PWA: HTML + CSS propio + JS módulos. Sin React, sin Tailwind, sin `style=""`.

## Global Constraints

- Stock = `SUM(entra) − SUM(sale)` sobre `movimientos`. La orden solo agrupa.
- Dos caminos: +1/−1 instantáneo **se queda**; “Registrar lote” es aparte.
- Un lote es todo `entra` o todo `sale`. Confirmada, no se edita ni se anula.
- Borrador solo en el celular. Cerrar/atrás/recargar con líneas o foto → “¿Descartar este lote?”.
- Foto del lote opcional en `/data/fotos` (`orden-{id}.ext`), mismos límites que producto (8–800_000 bytes, jpeg/png/webp).
- `dia` = `YYYY-MM-DD` local del teléfono. Lista filtra por esa columna, no por fecha UTC de `abierta_at`.
- `formatWhen`: hoy `13:12`; otro día `16 ago · 13:12`. No “hace X min”.
- Movimiento público: `orden_id` (o null) + `orden_abierta_at` si hay lote.
- Rate limit del POST de orden = movimientos (60/min por IP). Idempotencia por UUID.
- Sale: línea sin stock → `400 sin_stock` y rollback total. Pedir de más → recortar + `ajustado: true`.
- Sin cuentas. Bot WhatsApp no lista órdenes.
- Sin estilos inline. CSS en `public/css/app.css`. Mobile-first ~390px.
- Tests: `cd api && npm test` (`node --test test/*.test.js`). Conventional commits.
- Worktree: `/home/alore/projects/acopio-pereira/.worktrees/ordenes-entrada` en `feat/ordenes-entrada`.
- Spec: `docs/superpowers/specs/2026-08-17-ordenes-lote-design.md`.
- Issue: https://github.com/wWordDevw/acopio-pereira/issues/3

### File map

| Path | Responsibility |
|------|----------------|
| `api/sql/003_ordenes.sql` | Tabla `ordenes` + `movimientos.orden_id` |
| `api/src/db.js` | Migración, `insertOrden`, `getOrden`, `listOrdenes`, join en `listMovimientos` |
| `api/src/validate.js` | `validateOrden`, `validateDia` |
| `api/src/server.js` | Rutas POST/GET ordenes, foto, `publicOrden`, `orden_id` en movimiento |
| `api/src/openapi.js` | Documentar rutas nuevas |
| `api/test/validate.test.js` | Casos de `validateOrden` |
| `api/test/ordenes.test.js` | Los 6 criterios de API de la spec |
| `public/js/categorias.js` | `formatWhen` de reloj |
| `public/js/api.js` | `postOrden`, `listOrdenes`, `getOrden` |
| `public/punto.html` | Botón lote, panel borrador, lista/ficha del día |
| `public/js/punto.js` | Borrador, descarte, confirm, lista, ficha, chip |
| `public/css/app.css` | Panel lote, filas, chip, ficha |
| `public/sw.js` | Cache bust `insumos-v5` |

---

### Task 1: Migración y funciones de DB

**Files:**
- Create: `api/sql/003_ordenes.sql`
- Modify: `api/src/db.js`
- Test: `api/test/ordenes-db.test.js`

**Interfaces:**
- Consumes: `openDb`, `stockOf`, `insertMovimientos` patterns
- Produces:
  - `insertOrden(db, { id?, puntoId, tipo, abierta_at, dia, nota, foto_path, lineas, idempotency_key }) → { created, orden, rows, replay }` (`id` optional; caller passes it so `orden-{id}.ext` matches)
  - `getOrden(db, id) → row | undefined` (sin líneas)
  - `listLineasOrden(db, ordenId) → movimiento[]` joined to producto nombre/foto
  - `listOrdenes(db, puntoId, dia) → { id, tipo, abierta_at, dia, foto_path, lineas, unidades }[]`
  - `listMovimientos` incluye `orden_id` y `orden_abierta_at`
  - `findByIdempotency` acepta tabla `ordenes`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, insertPunto, insertOrden, listOrdenes, listMovimientos, stockByPunto } from "../src/db.js";

const KEY = (n) =>
  `${String(n).padStart(8, "0")}-cccc-4ccc-8ccc-cccccccccccc`;

describe("ordenes db", () => {
  let dir;
  let db;
  let puntoId;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "ord-db-"));
    db = openDb(join(dir, "t.sqlite"), { fotosDir: join(dir, "fotos") });
    const p = insertPunto(db, {
      nombre: "Expofuturo",
      lat: 4.81,
      lng: -75.7,
      nota: null,
      idempotency_key: KEY(1),
    });
    puntoId = p.row.id;
  });

  after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("inserts an order and movements; stock matches loose moves", () => {
    const r = insertOrden(db, {
      puntoId,
      tipo: "entra",
      abierta_at: "2026-08-17T18:12:00.000Z",
      dia: "2026-08-17",
      nota: null,
      foto_path: null,
      idempotency_key: KEY(2),
      lineas: [
        { categoria: "ninos", cantidad: 20, producto_id: null },
        { categoria: "comida", cantidad: 10, producto_id: null },
        { categoria: "higiene", cantidad: 8, producto_id: null },
      ],
    });
    assert.equal(r.created, true);
    assert.equal(r.rows.length, 3);
    assert.ok(r.rows.every((m) => m.orden_id === r.orden.id));
    const stock = stockByPunto(db, puntoId);
    const ninos = stock.find((s) => s.categoria === "ninos");
    assert.equal(ninos.stock, 20);
    const listed = listOrdenes(db, puntoId, "2026-08-17");
    assert.equal(listed.length, 1);
    assert.equal(listed[0].unidades, 38);
    assert.equal(listed[0].lineas, 3);
    assert.equal(listOrdenes(db, puntoId, "2026-08-16").length, 0);
    const movs = listMovimientos(db, puntoId, 10);
    assert.equal(movs[0].orden_abierta_at, "2026-08-17T18:12:00.000Z");
  });

  it("replays the same idempotency key", () => {
    const a = insertOrden(db, {
      puntoId,
      tipo: "entra",
      abierta_at: "2026-08-17T19:00:00.000Z",
      dia: "2026-08-17",
      nota: null,
      foto_path: null,
      idempotency_key: KEY(3),
      lineas: [{ categoria: "agua", cantidad: 1, producto_id: null }],
    });
    const b = insertOrden(db, {
      puntoId,
      tipo: "entra",
      abierta_at: "2026-08-17T19:00:00.000Z",
      dia: "2026-08-17",
      nota: null,
      foto_path: null,
      idempotency_key: KEY(3),
      lineas: [{ categoria: "agua", cantidad: 1, producto_id: null }],
    });
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(b.orden.id, a.orden.id);
    const agua = stockByPunto(db, puntoId).find((s) => s.categoria === "agua");
    assert.equal(agua.stock, 1);
  });

  it("rolls back the whole order when a sale line has zero stock", () => {
    assert.throws(
      () =>
        insertOrden(db, {
          puntoId,
          tipo: "sale",
          abierta_at: "2026-08-17T20:00:00.000Z",
          dia: "2026-08-17",
          nota: null,
          foto_path: null,
          idempotency_key: KEY(4),
          lineas: [{ categoria: "ropa", cantidad: 2, producto_id: null }],
        }),
      (err) => err.message === "sin_stock" && err.status === 400,
    );
    assert.equal(listOrdenes(db, puntoId, "2026-08-17").length, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && node --test test/ordenes-db.test.js`  
Expected: FAIL (module export / table missing)

- [ ] **Step 3: Add SQL + db functions**

`api/sql/003_ordenes.sql`:

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

create index if not exists movimientos_orden
  on movimientos (orden_id);
```

In `openDb`, after `migrateProductos`:

```js
function migrateOrdenes(db) {
  db.exec(ORDENES_SQL);
  if (!hasColumn(db, "movimientos", "orden_id")) {
    db.exec(
      "alter table movimientos add column orden_id text references ordenes(id)",
    );
  }
}
```

`findByIdempotency`: add `ordenes: true`.

`listMovimientos` SELECT:

```sql
select m.*, o.abierta_at as orden_abierta_at
from movimientos m
left join ordenes o on o.id = m.orden_id
where m.punto_id = ?
order by m.created_at desc, m.id desc
limit ?
```

`insertOrden`: check idempotency first; then `db.transaction` — insert `ordenes`, then for each line reuse the same stock clamp logic as `insertMovimientos` (including `sin_stock` throw) and set `orden_id`. Movement keys: first line uses `idempotency_key`, rest `${key}:${i}` so they don't collide with the orden key (orden key lives in `ordenes`, movement keys must still be unique in `movimientos` — use `${key}:m:${i}`).

`listOrdenes`:

```sql
select o.*,
  (select count(*) from movimientos m where m.orden_id = o.id) as lineas,
  (select coalesce(sum(m.cantidad), 0) from movimientos m where m.orden_id = o.id) as unidades
from ordenes o
where o.punto_id = ? and o.dia = ?
order by o.abierta_at desc
```

- [ ] **Step 4: Run tests**

Run: `cd api && node --test test/ordenes-db.test.js`  
Expected: PASS. Then `cd api && npm test` still green.

- [ ] **Step 5: Commit**

```bash
git add api/sql/003_ordenes.sql api/src/db.js api/test/ordenes-db.test.js
git commit -m "feat(api): ordenes table and atomic insert"
```

---

### Task 2: validateOrden

**Files:**
- Modify: `api/src/validate.js`
- Modify: `api/test/validate.test.js`

**Interfaces:**
- Consumes: `parseIdempotencyKey`, `parseCantidad`, `parseNota`, `validateFoto`, `CATEGORIAS`
- Produces: `validateOrden(body) → { ok, value } | { ok:false, error, status }`
  - `value`: `{ tipo, abierta_at, dia, nota, lineas, foto, idempotency_key }`
  - `lineas`: `{ categoria | null, producto_id | null, cantidad }[]` (exactly one of categoria / producto_id)
- Produces: `validateDia(raw) → { ok, value }` (`YYYY-MM-DD`)

- [ ] **Step 1: Write the failing tests** (append to `validate.test.js`)

```js
import { validateOrden, validateDia } from "../src/validate.js";

describe("validateOrden", () => {
  const base = {
    tipo: "entra",
    abierta_at: "2026-08-17T18:12:00.000Z",
    dia: "2026-08-17",
    lineas: [{ categoria: "agua", cantidad: 2 }],
    idempotency_key: KEY,
  };

  it("accepts a three-line entra", () => {
    const r = validateOrden({
      ...base,
      lineas: [
        { categoria: "ninos", cantidad: 20 },
        { categoria: "comida", cantidad: 10 },
        { categoria: "higiene", cantidad: 8 },
      ],
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.lineas.length, 3);
    assert.equal(r.value.dia, "2026-08-17");
  });

  it("rejects empty lineas", () => {
    const r = validateOrden({ ...base, lineas: [] });
    assert.equal(r.ok, false);
    assert.equal(r.error, "items_invalidos");
  });

  it("rejects bad tipo", () => {
    const r = validateOrden({ ...base, tipo: "mover" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "tipo_invalido");
  });

  it("rejects bad dia", () => {
    const r = validateOrden({ ...base, dia: "17/08/2026" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "dia_invalido");
  });

  it("rejects unparseable abierta_at", () => {
    const r = validateOrden({ ...base, abierta_at: "ayer" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "fecha_invalida");
  });
});

describe("validateDia", () => {
  it("accepts YYYY-MM-DD", () => {
    assert.equal(validateDia("2026-08-17").value, "2026-08-17");
  });
  it("rejects slashes", () => {
    assert.equal(validateDia("2026/08/17").ok, false);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd api && node --test test/validate.test.js`  
Expected: FAIL (`validateOrden` not exported)

- [ ] **Step 3: Implement**

```js
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateDia(raw) {
  const dia = trimOrNull(raw);
  if (!dia || !DIA_RE.test(dia)) return fail("dia_invalido");
  const [y, m, d] = dia.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return fail("dia_invalido");
  }
  return { ok: true, value: dia };
}

export function validateOrden(body) {
  const tipo = trimOrNull(body?.tipo);
  if (tipo !== "entra" && tipo !== "sale") return fail("tipo_invalido");
  const key = parseIdempotencyKey(body?.idempotency_key);
  if (!key.ok) return key;
  const dia = validateDia(body?.dia);
  if (!dia.ok) return dia;
  const abierta = trimOrNull(body?.abierta_at);
  if (!abierta || Number.isNaN(Date.parse(abierta))) return fail("fecha_invalida");
  const nota = parseNota(body?.nota);
  if (!nota.ok) return nota;
  if (!Array.isArray(body?.lineas) || body.lineas.length < 1 || body.lineas.length > 30) {
    return fail("items_invalidos");
  }
  const lineas = [];
  for (const raw of body.lineas) {
    const cantidad = parseCantidad(raw?.cantidad);
    if (!cantidad.ok) return cantidad;
    const productoId = trimOrNull(raw?.producto_id);
    const categoria = trimOrNull(raw?.categoria);
    if (productoId) {
      if (!UUID_RE.test(productoId)) return fail("producto_invalido");
      lineas.push({ producto_id: productoId, categoria: null, cantidad: cantidad.value });
    } else if (categoria && CATEGORIAS.includes(categoria)) {
      lineas.push({ producto_id: null, categoria, cantidad: cantidad.value });
    } else {
      return fail("categoria_invalida");
    }
  }
  let foto = null;
  if (body?.foto) {
    const parsed = validateFoto(body.foto);
    if (!parsed.ok) return parsed;
    foto = parsed.value;
  }
  return {
    ok: true,
    value: {
      tipo,
      abierta_at: abierta,
      dia: dia.value,
      nota: nota.value,
      lineas,
      foto,
      idempotency_key: key.value,
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd api && node --test test/validate.test.js && npm test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/validate.js api/test/validate.test.js
git commit -m "feat(api): validate orden payload and civil day"
```

---

### Task 3: Rutas HTTP de órdenes

**Files:**
- Modify: `api/src/server.js`
- Create: `api/test/ordenes.test.js`

**Interfaces:**
- Consumes: `validateOrden`, `validateDia`, `validatePuntoId`, `insertOrden`, `getOrden`, `listOrdenes`, `listLineasOrden`, `validateFoto` (already applied in validateOrden)
- Produces:
  - `POST /api/puntos/:id/ordenes` → 201/200 + `publicPunto` + `orden` + `aplicados` + `movimientos`
  - `GET /api/puntos/:id/ordenes?dia=` → `{ ordenes: publicOrdenResumen[] }`
  - `GET /api/ordenes/:id` → `publicOrden`
  - `GET /api/ordenes/:id/foto`
  - `publicMovimiento` adds `orden_id` and `orden_abierta_at` (null if loose)
  - Rate limit key `mov:${hashIp}` same as movimientos

`publicOrden(row, lineas)`:

```js
{
  id, punto_id, tipo, abierta_at, dia, cerrada_at, nota,
  foto: row.foto_path ? `/api/ordenes/${row.id}/foto` : null,
  lineas: lineas.map(... categoria, etiqueta, producto_id, nombre, cantidad, foto catálogo),
  unidades, // sum
}
```

Routing note: `GET /api/puntos/:id` currently 404s if `rest.includes("/")`. Add **before** that handler:

- `GET /api/puntos/:id/ordenes`
- `POST /api/puntos/:id/ordenes`

And new top-level:

- `GET /api/ordenes/:id/foto` (check `endsWith("/foto")` first)
- `GET /api/ordenes/:id`

Foto write (only if `parsed.value.foto`): decode base64, reject if `buf.length < 8 || buf.length > 800_000` with `foto_grande` **before** insert. Then `writeFileSync(join(photoDir, \`orden-${id}${ext}\`))` and pass `foto_path` into `insertOrden`. Generate `id` with `randomUUID()` and pass it into `insertOrden` so the filename matches.

`insertOrden` should accept optional `id`.

On replay (`created: false`), do not write a second photo; return existing orden.

- [ ] **Step 1: Write `api/test/ordenes.test.js`** (the six spec cases)

Use the same `createServer` + temp dir pattern as `productos.test.js`. Tiny PNG:

```
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==
```

Tests:

1. POST 3-line entra + foto → 201; stock ninos/comida/higiene; `GET /api/ordenes/:id` has `abierta_at`, 3 lineas, foto 200.
2. `GET /api/puntos/:id/ordenes?dia=2026-08-17` includes it; `dia=2026-08-16` empty. Missing `dia` → 400 `dia_invalido`.
3. Replay same `idempotency_key` → 200, same id, stock unchanged.
4. POST sale of `ropa` with no stock → 400 `sin_stock`; `GET` that would-be id 404; stock ropa absent.
5. POST loose movimiento; `GET /api/puntos/:id` movimiento has `orden_id === null`, `created_at` truthy.
6. POST 0 lineas → 400 `items_invalidos`. POST tipo `mover` → `tipo_invalido`. POST foto with 2-char base64 → `foto_invalida` or `foto_grande`.

- [ ] **Step 2: Run to verify fail**

Run: `cd api && node --test test/ordenes.test.js`  
Expected: FAIL (404 no_encontrado)

- [ ] **Step 3: Implement routes in `server.js`**

Keep CORS and `json()` helper. Export nothing new except reuse `publicPunto` / `publicMovimiento`.

Update `publicMovimiento`:

```js
function publicMovimiento(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    categoria: row.categoria,
    producto_id: row.producto_id || null,
    etiqueta: ETIQUETAS[row.categoria] || row.categoria,
    cantidad: row.cantidad,
    texto_original: row.texto_original,
    created_at: row.created_at,
    ajustado: Boolean(row.ajustado),
    orden_id: row.orden_id || null,
    orden_abierta_at: row.orden_id ? row.orden_abierta_at || null : null,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd api && node --test test/ordenes.test.js && npm test`  
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/server.js api/src/db.js api/test/ordenes.test.js
git commit -m "feat(api): POST/GET ordenes and lot photo"
```

---

### Task 4: OpenAPI e índice

**Files:**
- Modify: `api/src/openapi.js`
- Modify: `api/src/server.js` (`GET /api` endpoints map)
- Modify: `api/test/server.test.js` only if the existing “serves OpenAPI” test needs a path assertion

**Interfaces:**
- Consumes: route shapes from Task 3
- Produces: OpenAPI paths for the four routes; `GET /api` lists `ordenes`, `orden`, `crear_orden`

- [ ] **Step 1: Extend the existing OpenAPI test** (in `server.test.js`)

```js
it("openapi lists ordenes routes", async () => {
  const res = await fetch(`${base}/api/openapi.json`);
  const spec = await res.json();
  assert.ok(spec.paths["/api/puntos/{id}/ordenes"]);
  assert.ok(spec.paths["/api/ordenes/{id}"]);
  assert.ok(spec.paths["/api/ordenes/{id}/foto"]);
  const idx = await fetch(`${base}/api`).then((r) => r.json());
  assert.ok(idx.endpoints.crear_orden);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd api && node --test test/server.test.js`  
Expected: FAIL (paths missing)

- [ ] **Step 3: Document**

Add schemas `orden`, `ordenResumen`. Paths:

- `POST /api/puntos/{id}/ordenes`
- `GET /api/puntos/{id}/ordenes` query `dia`
- `GET /api/ordenes/{id}`
- `GET /api/ordenes/{id}/foto`

`GET /api` endpoints:

```js
crear_orden: "POST /api/puntos/:id/ordenes",
ordenes: "GET /api/puntos/:id/ordenes?dia=",
orden: "GET /api/ordenes/:id",
```

- [ ] **Step 4: Run** `cd api && npm test` — PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/openapi.js api/src/server.js api/test/server.test.js
git commit -m "docs(api): OpenAPI for lot orders"
```

---

### Task 5: formatWhen de reloj

**Files:**
- Modify: `public/js/categorias.js`
- Create: `api/test/format-when.test.js` that dynamically imports `../../public/js/categorias.js` (no DOM deps)

**Interfaces:**
- Consumes: ISO string (SQLite UTC without Z, or ISO with Z)
- Produces: today → `HH:MM` 2-digit local; other local day → `d mon · HH:MM` with `es-CO` short month (e.g. `16 ago · 13:12`)

- [ ] **Step 1: Failing test**

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatWhen } from "../../public/js/categorias.js";

describe("formatWhen", () => {
  it("prints clock time for today, not hace X min", () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - 12);
    const text = formatWhen(d.toISOString());
    assert.equal(/\dhace\b/.test(text), false);
    assert.match(text, /^\d{2}:\d{2}$/);
  });

  it("prints day and month for another calendar day", () => {
    const text = formatWhen("2026-08-16T18:12:00.000Z");
    assert.match(text, /\d{1,2}\s+\w+\s+·\s+\d{2}:\d{2}/);
  });
});
```

If the machine local TZ makes 2026-08-16T18:12Z a different local date, still assert it is **not** `hace` and contains `·` or is `HH:MM`. Prefer asserting no `hace`.

- [ ] **Step 2: Run fail** — still matches `hace 12 min`

- [ ] **Step 3: Replace `formatWhen`**

```js
export function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (sameDay) return time;
  const day = d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  return `${day} · ${time}`;
}
```

- [ ] **Step 4: Run** `cd api && node --test test/format-when.test.js && npm test`

- [ ] **Step 5: Commit**

```bash
git add public/js/categorias.js api/test/format-when.test.js
git commit -m "feat(pwa): clock times instead of relative hace"
```

---

### Task 6: Cliente API + panel Registrar lote

**Files:**
- Modify: `public/js/api.js`
- Modify: `public/punto.html`
- Modify: `public/js/punto.js`

**Interfaces:**
- Consumes: Task 3 routes, `formatWhen`, `newKey`, existing category/product picker
- Produces:
  - `postOrden(puntoId, body)`, `listOrdenes(puntoId, dia)`, `getOrden(id)`
  - Instant register panel **unchanged** in behavior
  - New button `#btn-lote` “Registrar lote” + `#lote-panel` with Entra/Sale, `#lote-hora`, line list `#lote-lineas`, foto `#lote-foto`, `#btn-lote-confirmar`, `#btn-lote-cerrar`
  - Draft in memory: `{ tipo, abiertaAt: Date, dia, lineas: [{ producto_id?, categoria, nombre, cantidad }], fotoFile, idempotency_key }`
  - Confirm → `postOrden`. 0 líneas → do not POST, status “Agrega al menos un insumo”.
  - Close / `beforeunload` if draft dirty → `confirm("¿Descartar este lote?")`

HTML placement: a second `.btn.btn-primary` **below** `#btn-registrar` inside `<section class="registrar">` (or a sibling section). Do **not** remove the existing registrar panel.

Lote panel reuses category tiles + product list **or** a compact add-to-draft: tapping a product in lote mode calls `addLinea(...)` instead of `send(...)`. Implement a `modo` flag (`suelto` | `lote`) so the existing `abrirCategoria` can add to draft when `modo === "lote"`.

When opening lote panel: set `abiertaAt = new Date()`, `dia = local YYYY-MM-DD`, `idempotency_key = newKey()`, show `Lote de las ${formatWhen(abiertaAt.toISOString())}`. Do not refresh that timestamp on confirm.

Toast: `Entraron ${n} en el lote de las HH:MM.` / `Salieron…`

Photo: same FileReader → base64 pattern as product photo.

- [ ] **Step 1:** No automated PWA test runner. Backend already covers the contract. Implement HTML + JS.

- [ ] **Step 2:** Manual check list (implementer walks it if a browser is available; otherwise note it):
  - Instant +1 still posts immediately
  - Lote + 2 products does not change stock until confirm
  - Close with lines → discard prompt

- [ ] **Step 3: Commit**

```bash
git add public/js/api.js public/punto.html public/js/punto.js
git commit -m "feat(pwa): draft lot panel with confirm and discard"
```

---

### Task 7: Lista del día, ficha, chip, CSS, SW

**Files:**
- Modify: `public/punto.html` — `<details id="ordenes-fold">` “Órdenes de hoy” with `#ordenes-lista`; overlay/section `#orden-ficha` hidden
- Modify: `public/js/punto.js` — fetch `listOrdenes(id, hoyLocal())` on paint; render rows; click → `getOrden` + ficha; `renderMovs` chip “Lote HH:MM” if `orden_id`
- Modify: `public/css/app.css` — `.lote-panel`, `.lote-linea`, `.orden-row`, `.orden-chip`, `.orden-ficha` using existing tokens (`--sale`, `.btn`, `.hint`). No `style=""`.
- Modify: `public/sw.js` — `CACHE = "insumos-v5"`

**Interfaces:**
- Consumes: `listOrdenes`, `getOrden`, `formatWhen`, `orden_abierta_at`
- Produces: day list + read-only ficha + movement chips

`hoyLocal()`:

```js
function hoyLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
```

Ficha: hora (`formatWhen(abierta_at)`), tipo, nota, img if `foto`, lines with catalog photo if present. Close button only.

After successful lote confirm, refresh the day list.

Chip in `renderMovs`: button `.orden-chip` text `Lote ${formatWhen(m.orden_abierta_at)}` → open that orden ficha.

- [ ] **Step 1: Implement markup, CSS, JS, SW bump**

- [ ] **Step 2: Run** `cd api && npm test` (must stay green)

- [ ] **Step 3: If browser tools exist, verify at ~390px:** criteria 1–5 of the spec. If not, say so in the commit message body / report.

- [ ] **Step 4: Commit**

```bash
git add public/punto.html public/js/punto.js public/css/app.css public/sw.js
git commit -m "feat(pwa): today orders, lot sheet, and movement chips"
```

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| Tabla `ordenes` + `movimientos.orden_id` | 1 |
| POST atómico + rollback sale | 1, 3 |
| `dia` civil del teléfono | 1, 2, 3, 7 |
| GET lista / ficha / foto | 3 |
| `orden_id` + `orden_abierta_at` en movimiento | 1, 3 |
| Validación y errores de la tabla | 2, 3 |
| OpenAPI | 4 |
| `formatWhen` reloj | 5 |
| +1 suelto intacto + panel lote + descarte | 6 |
| Órdenes de hoy + ficha + chip | 7 |
| Foto lote `/data/fotos` | 3, 6 |
| Rate limit / idempotencia | 3 |
| Bot no cambia | — (no task) |

## Self-review

- No TBD. Names (`insertOrden`, `validateOrden`, `dia`, `orden_abierta_at`) are consistent across tasks.
- PWA tasks 6–7 are sequential (6 builds the draft; 7 consumes `listOrdenes` on the same page).
- `insertOrden` optional `id` is introduced in Task 1 so Task 3 can name the photo file.
