import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";
import { createServer } from "../src/server.js";
import {
  findProductoEnLista,
  foldNombre,
  slugNombre,
  SEMILLA_PRODUCTOS,
} from "../src/productos.js";

const KEY = (n) =>
  `${String(n).padStart(8, "0")}-bbbb-4bbb-8bbb-bbbbbbbbbbbb`;

describe("catalogo match", () => {
  it("folds pasta variants to the same slug", () => {
    assert.equal(slugNombre("Pasta"), "pasta");
    assert.equal(foldNombre("  PÁSTAS  "), "pastas");
  });

  it("maps fideos to pasta via alias", () => {
    const hit = findProductoEnLista(SEMILLA_PRODUCTOS, "fideos", "comida");
    assert.equal(hit.nombre, "Pasta");
  });

  it("maps pañales UPP wording to pañales", () => {
    const hit = findProductoEnLista(
      SEMILLA_PRODUCTOS,
      "Pañales etapa 3, 4, 5",
      "ninos",
    );
    assert.equal(hit.nombre, "Pañales");
  });

  it("does not put pet food in comida", () => {
    const hit = findProductoEnLista(
      SEMILLA_PRODUCTOS,
      "alimento para mascotas",
      "comida",
    );
    assert.equal(hit, null);
    const pet = findProductoEnLista(
      SEMILLA_PRODUCTOS,
      "alimento para mascotas",
      "mascotas",
    );
    assert.equal(pet.categoria, "mascotas");
  });
});

describe("productos api", () => {
  let dir;
  let db;
  let server;
  let base;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "prod-"));
    db = openDb(join(dir, "t.sqlite"), { fotosDir: join(dir, "fotos") });
    server = createServer({ db, trustProxy: true, fotosDir: join(dir, "fotos") });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    base = `http://127.0.0.1:${port}`;
  });

  after(() => {
    server.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists ninos products including pañales", async () => {
    const res = await fetch(`${base}/api/productos?categoria=ninos`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.productos.some((p) => p.slug === "panales"));
  });

  it("creates a new product once and reuses the folded name", async () => {
    const first = await fetch(`${base}/api/productos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: "Quinua",
        categoria: "comida",
        idempotency_key: KEY(1),
      }),
    });
    assert.equal(first.status, 201);
    const a = await first.json();
    const second = await fetch(`${base}/api/productos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: "quinua",
        categoria: "comida",
        idempotency_key: KEY(2),
      }),
    });
    assert.equal(second.status, 200);
    const b = await second.json();
    assert.equal(a.id, b.id);
  });

  it("rejects a near-duplicate with candidatos", async () => {
    const res = await fetch(`${base}/api/productos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: "Pañales etapa 0",
        categoria: "ninos",
        idempotency_key: KEY(3),
      }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, "posible_duplicado");
    assert.ok(body.candidatos.some((c) => c.slug === "panales"));
  });

  it("stores optional photo and serves it", async () => {
    const created = await fetch(`${base}/api/productos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: "Gel antibacterial",
        categoria: "higiene",
        idempotency_key: KEY(4),
      }),
    }).then((r) => r.json());
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const up = await fetch(`${base}/api/productos/${created.id}/foto`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imagen_base64: png, mime: "image/png" }),
    });
    assert.equal(up.status, 200);
    const got = await fetch(`${base}/api/productos/${created.id}/foto`);
    assert.equal(got.status, 200);
    assert.match(got.headers.get("content-type"), /image\/png/);
    assert.ok((await got.arrayBuffer()).byteLength > 10);
    assert.ok(existsSync(join(dir, "fotos")));
  });

  it("movement with producto_id stocks that product", async () => {
    const punto = await fetch(`${base}/api/puntos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: "Acopio prueba",
        lat: 4.81,
        lng: -75.7,
        idempotency_key: KEY(10),
      }),
    }).then((r) => r.json());
    const prod = await fetch(`${base}/api/productos?q=panales`).then((r) =>
      r.json(),
    );
    const pañales = prod.productos.find((p) => p.slug === "panales");
    const mov = await fetch(`${base}/api/puntos/${punto.id}/movimientos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tipo: "entra",
        producto_id: pañales.id,
        cantidad: 12,
        idempotency_key: KEY(11),
      }),
    });
    assert.equal(mov.status, 201);
    const body = await mov.json();
    const line = body.inventario.find((i) => i.producto_id === pañales.id);
    assert.equal(line.stock, 12);
    assert.equal(line.nombre, "Pañales");

    const listed = await fetch(
      `${base}/api/consultar?categoria=ninos`,
    ).then((r) => r.json());
    const listedPunto = listed.puntos.find((p) => p.id === punto.id);
    const listedLine = listedPunto.inventario.find(
      (i) => i.producto_id === pañales.id,
    );
    assert.equal(listedLine.stock, 12);
    assert.equal(listedLine.nombre, "Pañales");
  });
});
