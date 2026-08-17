import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";
import { createServer } from "../src/server.js";

const KEY = (n) =>
  `${String(n).padStart(8, "0")}-dddd-4ddd-8ddd-dddddddddddd`;

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const ABIERTA = "2026-08-17T18:12:00.000Z";
const DIA = "2026-08-17";

describe("ordenes api", () => {
  let dir;
  let db;
  let server;
  let base;
  let punto;
  let ordenId;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "ord-api-"));
    db = openDb(join(dir, "t.sqlite"), { fotosDir: join(dir, "fotos") });
    server = createServer({
      db,
      trustProxy: true,
      fotosDir: join(dir, "fotos"),
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    base = `http://127.0.0.1:${port}`;
    const created = await fetch(`${base}/api/puntos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: "Expofuturo",
        lat: 4.81,
        lng: -75.7,
        idempotency_key: KEY(1),
      }),
    });
    punto = await created.json();
  });

  after(() => {
    server.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function post(path, body) {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  it("posts a 3-line entra with photo and serves the ficha", async () => {
    const res = await post(`/api/puntos/${punto.id}/ordenes`, {
      tipo: "entra",
      abierta_at: ABIERTA,
      dia: DIA,
      lineas: [
        { categoria: "ninos", cantidad: 20 },
        { categoria: "comida", cantidad: 10 },
        { categoria: "higiene", cantidad: 8 },
      ],
      foto: { imagen_base64: PNG, mime: "image/png" },
      idempotency_key: KEY(2),
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.orden);
    ordenId = res.body.orden.id;
    const ninos = res.body.inventario.find((i) => i.categoria === "ninos");
    const comida = res.body.inventario.find((i) => i.categoria === "comida");
    const higiene = res.body.inventario.find((i) => i.categoria === "higiene");
    assert.equal(ninos.stock, 20);
    assert.equal(comida.stock, 10);
    assert.equal(higiene.stock, 8);
    assert.equal(res.body.aplicados.length, 3);
    assert.ok(res.body.aplicados.every((m) => m.orden_id === ordenId));

    const got = await fetch(`${base}/api/ordenes/${ordenId}`);
    assert.equal(got.status, 200);
    const ficha = await got.json();
    assert.equal(ficha.abierta_at, ABIERTA);
    assert.equal(ficha.lineas.length, 3);
    assert.equal(ficha.unidades, 38);
    assert.equal(ficha.foto, `/api/ordenes/${ordenId}/foto`);

    const foto = await fetch(`${base}/api/ordenes/${ordenId}/foto`);
    assert.equal(foto.status, 200);
    assert.match(foto.headers.get("content-type"), /image\/png/);
    assert.ok((await foto.arrayBuffer()).byteLength > 10);
  });

  it("lists ordenes by civil dia and rejects a missing dia", async () => {
    const same = await fetch(
      `${base}/api/puntos/${punto.id}/ordenes?dia=${DIA}`,
    );
    assert.equal(same.status, 200);
    const sameBody = await same.json();
    assert.ok(sameBody.ordenes.some((o) => o.id === ordenId));

    const other = await fetch(
      `${base}/api/puntos/${punto.id}/ordenes?dia=2026-08-16`,
    );
    assert.equal(other.status, 200);
    const otherBody = await other.json();
    assert.equal(otherBody.ordenes.length, 0);

    const missing = await fetch(`${base}/api/puntos/${punto.id}/ordenes`);
    assert.equal(missing.status, 400);
    const missingBody = await missing.json();
    assert.equal(missingBody.error, "dia_invalido");
  });

  it("replays the same idempotency key without changing stock", async () => {
    const res = await post(`/api/puntos/${punto.id}/ordenes`, {
      tipo: "entra",
      abierta_at: ABIERTA,
      dia: DIA,
      lineas: [
        { categoria: "ninos", cantidad: 20 },
        { categoria: "comida", cantidad: 10 },
        { categoria: "higiene", cantidad: 8 },
      ],
      foto: { imagen_base64: PNG, mime: "image/png" },
      idempotency_key: KEY(2),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.orden.id, ordenId);
    const ninos = res.body.inventario.find((i) => i.categoria === "ninos");
    const comida = res.body.inventario.find((i) => i.categoria === "comida");
    const higiene = res.body.inventario.find((i) => i.categoria === "higiene");
    assert.equal(ninos.stock, 20);
    assert.equal(comida.stock, 10);
    assert.equal(higiene.stock, 8);
  });

  it("rejects a sale with no stock and does not persist the orden", async () => {
    const res = await post(`/api/puntos/${punto.id}/ordenes`, {
      tipo: "sale",
      abierta_at: "2026-08-17T20:00:00.000Z",
      dia: DIA,
      lineas: [{ categoria: "ropa", cantidad: 2 }],
      idempotency_key: KEY(3),
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "sin_stock");
    assert.equal(res.body.orden, undefined);

    const listed = await fetch(
      `${base}/api/puntos/${punto.id}/ordenes?dia=${DIA}`,
    ).then((r) => r.json());
    assert.ok(listed.ordenes.every((o) => o.tipo !== "sale"));

    const phantom = await fetch(
      `${base}/api/ordenes/${KEY(3)}`,
    );
    assert.equal(phantom.status, 404);
    assert.equal((await phantom.json()).error, "no_encontrado");

    const puntoRes = await fetch(`${base}/api/puntos/${punto.id}`).then((r) =>
      r.json(),
    );
    assert.equal(
      puntoRes.inventario.find((i) => i.categoria === "ropa"),
      undefined,
    );
  });

  it("keeps loose movimientos without an orden_id", async () => {
    const catalogo = await fetch(`${base}/api/productos?categoria=agua`).then(
      (r) => r.json(),
    );
    const agua = catalogo.productos[0];
    assert.ok(agua, "seed product for agua");
    const mov = await post(`/api/puntos/${punto.id}/movimientos`, {
      tipo: "entra",
      producto_id: agua.id,
      cantidad: 3,
      idempotency_key: KEY(4),
    });
    assert.equal(mov.status, 201);
    const applied = mov.body.aplicados[0];
    assert.equal(applied.orden_id, null);
    assert.ok(applied.created_at);

    const puntoRes = await fetch(`${base}/api/puntos/${punto.id}`).then((r) =>
      r.json(),
    );
    const loose = puntoRes.movimientos.find((m) => m.id === applied.id);
    assert.ok(loose);
    assert.equal(loose.orden_id, null);
    assert.ok(loose.created_at);
    assert.equal(loose.orden_abierta_at, null);
  });

  it("rejects empty lineas, bad tipo, and a tiny foto", async () => {
    const empty = await post(`/api/puntos/${punto.id}/ordenes`, {
      tipo: "entra",
      abierta_at: ABIERTA,
      dia: DIA,
      lineas: [],
      idempotency_key: KEY(5),
    });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error, "items_invalidos");

    const badTipo = await post(`/api/puntos/${punto.id}/ordenes`, {
      tipo: "mover",
      abierta_at: ABIERTA,
      dia: DIA,
      lineas: [{ categoria: "agua", cantidad: 1 }],
      idempotency_key: KEY(6),
    });
    assert.equal(badTipo.status, 400);
    assert.equal(badTipo.body.error, "tipo_invalido");

    const tinyFoto = await post(`/api/puntos/${punto.id}/ordenes`, {
      tipo: "entra",
      abierta_at: ABIERTA,
      dia: DIA,
      lineas: [{ categoria: "agua", cantidad: 1 }],
      foto: { imagen_base64: "ab", mime: "image/png" },
      idempotency_key: KEY(7),
    });
    assert.equal(tinyFoto.status, 400);
    assert.ok(
      tinyFoto.body.error === "foto_invalida" ||
        tinyFoto.body.error === "foto_grande",
    );
  });

  it("accepts a lot photo larger than the default 16k body limit", async () => {
    const imagen_base64 = PNG + "A".repeat(20_000);
    const payload = {
      tipo: "entra",
      abierta_at: ABIERTA,
      dia: DIA,
      lineas: [{ categoria: "cobijas", cantidad: 1 }],
      foto: { imagen_base64, mime: "image/png" },
      idempotency_key: KEY(8),
    };
    const raw = JSON.stringify(payload);
    assert.ok(raw.length > 16_000);
    assert.ok(Buffer.from(imagen_base64, "base64").length < 800_000);

    const res = await post(`/api/puntos/${punto.id}/ordenes`, payload);
    assert.equal(res.status, 201);
    assert.ok(res.body.orden?.foto);
    assert.equal(res.body.error, undefined);
  });
});
