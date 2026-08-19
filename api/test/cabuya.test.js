import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";
import { createServer } from "../src/server.js";
import { toPlace, buildPlaceFeed, rfc3339 } from "../src/cabuya.js";

const BASE = "https://ejemplo.test";
const KEY = (n) => `${String(n).padStart(8, "0")}-cccc-4ccc-8ccc-cccccccccccc`;

const fila = (extra = {}) => ({
  id: "p1",
  nombre: "Acopio · Olaya",
  nota: "Acopio · Activo · GPS · Parque Olaya",
  lat: 4.809232,
  lng: -75.696403,
  created_at: "2026-08-16 19:00:09",
  updated_at: "2026-08-17 05:24:45",
  ultimo_movimiento: null,
  ...extra,
});

describe("cabuya · mapeo de place", () => {
  it("traduce un acopio con todos los campos requeridos por el esquema 0.1", () => {
    const p = toPlace(fila(), { baseUrl: BASE });
    for (const campo of [
      "id",
      "publisher_id",
      "name",
      "place_kind",
      "municipality_code",
      "lifecycle_status",
      "last_confirmed_at",
      "source",
      "public_url",
    ]) {
      assert.ok(campo in p, `falta ${campo}`);
    }
    assert.equal(p.place_kind, "collection_center");
    assert.equal(p.origin_category, "Acopio");
    assert.equal(p.geo_precision, "exact");
    assert.equal(p.service_status, "open");
  });

  it("mapea albergue y estado lleno", () => {
    const p = toPlace(
      fila({ nombre: "Albergue · Boston", nota: "Albergue · Lleno · pin aproximado · Boston" }),
      { baseUrl: BASE },
    );
    assert.equal(p.place_kind, "shelter");
    assert.equal(p.service_status, "full");
    assert.equal(p.geo_precision, "approximate");
  });

  it("CR-2: el nombre no arrastra el tipo", () => {
    assert.equal(toPlace(fila(), { baseUrl: BASE }).name, "Olaya");
  });

  it("Dosquebradas es municipio propio, el resto es Pereira", () => {
    const d = toPlace(fila({ nota: "Acopio · Activo · GPS · Dosquebradas" }), { baseUrl: BASE });
    assert.equal(d.municipality_code, "66170");
    assert.equal(toPlace(fila(), { baseUrl: BASE }).municipality_code, "66001");
  });

  it("«Otra zona» no se publica como barrio", () => {
    const p = toPlace(fila({ nota: "Acopio · Activo · GPS · Otra zona" }), { baseUrl: BASE });
    assert.equal("neighborhood_text" in p, false);
  });

  it("CR-1: editar no confirma; sin movimientos last_confirmed_at es null", () => {
    assert.equal(toPlace(fila(), { baseUrl: BASE }).last_confirmed_at, null);
    const c = toPlace(fila({ ultimo_movimiento: "2026-08-17 04:00:00" }), { baseUrl: BASE });
    assert.equal(c.last_confirmed_at, "2026-08-17T04:00:00Z");
    assert.equal(c.confirmation_method, "user_report");
  });

  it("descarta lo que no tiene tipo reconocido (§7.5: nada de lugares inventados)", () => {
    assert.equal(toPlace(fila({ nombre: "Prueba browser", nota: "desde playwright" }), { baseUrl: BASE }), null);
    assert.equal(toPlace(fila({ nombre: "Test 20 de Julio", nota: null }), { baseUrl: BASE }), null);
  });

  it("§7.2: ningún valor de contacto viaja", () => {
    const texto = JSON.stringify(toPlace(fila(), { baseUrl: BASE }));
    assert.equal(/\b3\d{9}\b|\+57|@/.test(texto), false);
    assert.equal(toPlace(fila(), { baseUrl: BASE }).contact_available, false);
  });

  it("rfc3339 convierte el formato de SQLite y respeta lo ya normalizado", () => {
    assert.equal(rfc3339("2026-08-17 05:24:45"), "2026-08-17T05:24:45Z");
    assert.equal(rfc3339("2026-08-17T05:24:45Z"), "2026-08-17T05:24:45Z");
    assert.equal(rfc3339(null), null);
  });
});

describe("cabuya · feed y ruta", () => {
  let dir;
  let db;
  let server;
  let base;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "acopio-cabuya-"));
    db = openDb(join(dir, "t.sqlite"));
    db.prepare(
      "insert into puntos (id, nombre, nota, lat, lng, idempotency_key, created_at, updated_at) values (?,?,?,?,?,?,?,?)",
    ).run("p1", "Acopio · Olaya", "Acopio · Activo · GPS · Parque Olaya", 4.8, -75.69, KEY(1), "2026-08-16 19:00:09", "2026-08-17 05:24:45");
    db.prepare(
      "insert into puntos (id, nombre, nota, lat, lng, idempotency_key, created_at, updated_at) values (?,?,?,?,?,?,?,?)",
    ).run("p2", "Prueba browser", "desde playwright", 4.8, -75.69, KEY(2), "2026-08-16 19:00:09", "2026-08-18 01:00:00");

    server = createServer({ db, publicWeb: BASE });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    server.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("el envelope trae los campos requeridos", () => {
    const feed = buildPlaceFeed(db, { baseUrl: BASE });
    for (const campo of ["last_updated", "ttl", "version", "publisher_id", "license", "data"]) {
      assert.ok(campo in feed, `falta ${campo}`);
    }
    assert.equal(feed.version, "0.1.0");
    assert.equal(feed.license, "CC0-1.0");
    assert.ok(Array.isArray(feed.data.places));
  });

  it("last_updated sale del dato, no de la hora de la petición", () => {
    const a = buildPlaceFeed(db, { baseUrl: BASE });
    const b = buildPlaceFeed(db, { baseUrl: BASE });
    assert.equal(a.last_updated, b.last_updated);
    assert.equal(a.last_updated, "2026-08-17T05:24:45Z");
  });

  it("los registros de prueba no entran al feed", () => {
    const feed = buildPlaceFeed(db, { baseUrl: BASE });
    assert.equal(feed.data.places.length, 1);
    assert.equal(feed.data.places[0].id, "p1");
  });

  it("la ruta responde JSON con CORS abierto", async () => {
    const r = await fetch(`${base}/api/cabuya/places.json`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /application\/json/);
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
    const feed = await r.json();
    assert.equal(feed.publisher_id, "insumos-pereira");
  });

  it("el manifiesto publicado apunta al feed servido", async () => {
    const manifiesto = JSON.parse(
      readFileSync(new URL("../../public/.well-known/cabuya.json", import.meta.url), "utf8"),
    );
    assert.equal(manifiesto.protocol.name, "cabuya");
    assert.equal(manifiesto.publisher.publisher_id, "insumos-pereira");
    assert.equal(manifiesto.license, "CC0-1.0");
    assert.match(manifiesto.feeds[0].url, /\/api\/cabuya\/places\.json$/);
    assert.equal(manifiesto.feeds[0].entity, "place");
  });
});
