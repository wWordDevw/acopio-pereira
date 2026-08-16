import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";
import { createServer } from "../src/server.js";

const KEY = (n) =>
  `${String(n).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;

describe("server", () => {
  let dir;
  let db;
  let server;
  let base;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "acopio-srv-"));
    db = openDb(join(dir, "t.sqlite"));
    server = createServer({ db, trustProxy: true });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    base = `http://127.0.0.1:${port}`;
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

  it("salud is 200", async () => {
    const res = await fetch(`${base}/api/salud`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  });

  it("health alias is 200", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
  });

  it("creates a point and replays the same key", async () => {
    const payload = {
      nombre: "Cancha Cuba",
      lat: 4.81,
      lng: -75.7,
      idempotency_key: KEY(1),
    };
    const first = await post("/api/puntos", payload);
    const second = await post("/api/puntos", payload);
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.body.id, first.body.id);
  });

  it("adds stock with a button and lists it on the map", async () => {
    const created = await post("/api/puntos", {
      nombre: "Iglesia",
      lat: 4.82,
      lng: -75.69,
      idempotency_key: KEY(2),
    });
    const mov = await post(`/api/puntos/${created.body.id}/movimientos`, {
      tipo: "entra",
      categoria: "cobijas",
      cantidad: 10,
      idempotency_key: KEY(3),
    });
    assert.equal(mov.status, 201);
    const list = await fetch(`${base}/api/puntos`);
    const data = await list.json();
    const punto = data.puntos.find((p) => p.id === created.body.id);
    assert.equal(punto.tiene_stock, true);
    assert.equal(
      punto.inventario.find((i) => i.categoria === "cobijas").stock,
      10,
    );
  });

  it("clamps sale to available stock", async () => {
    const created = await post("/api/puntos", {
      nombre: "Colegio",
      lat: 4.8,
      lng: -75.71,
      idempotency_key: KEY(4),
    });
    await post(`/api/puntos/${created.body.id}/movimientos`, {
      tipo: "entra",
      categoria: "agua",
      cantidad: 4,
      idempotency_key: KEY(5),
    });
    const sale = await post(`/api/puntos/${created.body.id}/movimientos`, {
      tipo: "sale",
      categoria: "agua",
      cantidad: 10,
      idempotency_key: KEY(6),
    });
    assert.equal(sale.status, 201);
    assert.equal(sale.body.aplicados[0].cantidad, 4);
    assert.equal(sale.body.aplicados[0].ajustado, true);
    assert.equal(
      sale.body.inventario.find((i) => i.categoria === "agua"),
      undefined,
    );
  });

  it("rejects sale with zero stock", async () => {
    const created = await post("/api/puntos", {
      nombre: "Parque",
      lat: 4.815,
      lng: -75.695,
      idempotency_key: KEY(7),
    });
    const sale = await post(`/api/puntos/${created.body.id}/movimientos`, {
      tipo: "sale",
      categoria: "comida",
      cantidad: 1,
      idempotency_key: KEY(8),
    });
    assert.equal(sale.status, 400);
    assert.equal(sale.body.error, "sin_stock");
  });

  it("parses voice into several movements", async () => {
    const created = await post("/api/puntos", {
      nombre: "Villa",
      lat: 4.812,
      lng: -75.694,
      idempotency_key: KEY(9),
    });
    const mov = await post(`/api/puntos/${created.body.id}/movimientos`, {
      tipo: "entra",
      texto: "20 cobijas y 10 kits de aseo",
      idempotency_key: KEY(10),
    });
    assert.equal(mov.status, 201);
    const cobijas = mov.body.inventario.find((i) => i.categoria === "cobijas");
    const higiene = mov.body.inventario.find((i) => i.categoria === "higiene");
    assert.equal(cobijas.stock, 20);
    assert.equal(higiene.stock, 10);
  });

  it("rejects point outside Risaralda box", async () => {
    const r = await post("/api/puntos", {
      nombre: "Bogotá",
      lat: 4.65,
      lng: -74.05,
      idempotency_key: KEY(11),
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "fuera_de_zona");
  });

  it("consulta by category returns only matching stock", async () => {
    const a = await post("/api/puntos", {
      nombre: "Punto Agua",
      lat: 4.813,
      lng: -75.696,
      idempotency_key: KEY(12),
    });
    await post(`/api/puntos/${a.body.id}/movimientos`, {
      tipo: "entra",
      categoria: "agua",
      cantidad: 8,
      idempotency_key: KEY(13),
    });
    const res = await fetch(`${base}/api/consultar?q=agua`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    const data = await res.json();
    assert.equal(data.consulta.categoria, "agua");
    assert.ok(data.total >= 1);
    assert.ok(data.puntos.every((p) => p.inventario.some((i) => i.categoria === "agua")));
  });

  it("serves OpenAPI and Swagger UI", async () => {
    const specRes = await fetch(`${base}/api/openapi.json`);
    assert.equal(specRes.status, 200);
    const spec = await specRes.json();
    assert.equal(spec.openapi, "3.0.3");
    assert.ok(spec.paths["/api/consultar"]);
    assert.ok(spec.paths["/api/puntos"]);
    const docs = await fetch(`${base}/api/docs`);
    assert.equal(docs.status, 200);
    const html = await docs.text();
    assert.match(html, /swagger-ui/);
    const cat = await fetch(`${base}/api`);
    const index = await cat.json();
    assert.equal(index.documentacion, "/api/docs");
  });
});
