import { CATEGORIAS, enCaja } from "./categorias.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_RE = /https?:\/\/|www\.|bit\.ly|t\.co/i;

function fail(error, status = 400) {
  return { ok: false, error, status };
}

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function hasForbiddenUrl(value) {
  return value != null && URL_RE.test(value);
}

function parseIdempotencyKey(raw) {
  const key = trimOrNull(raw);
  if (!key || !UUID_RE.test(key)) {
    return fail("idempotency_key_invalida");
  }
  return { ok: true, value: key };
}

function parseNombre(raw) {
  const nombre = trimOrNull(raw);
  if (!nombre || nombre.length < 2 || nombre.length > 80) {
    return fail("nombre_invalido");
  }
  if (hasForbiddenUrl(nombre)) return fail("url_no_permitida");
  return { ok: true, value: nombre };
}

function parseNota(raw) {
  const nota = trimOrNull(raw);
  if (!nota) return { ok: true, value: null };
  if (nota.length > 200) return fail("nota_invalida");
  if (hasForbiddenUrl(nota)) return fail("url_no_permitida");
  return { ok: true, value: nota };
}

function parseCoord(raw, error) {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n)) return fail(error);
  return { ok: true, value: n };
}

export function validatePunto(body) {
  const nombre = parseNombre(body?.nombre);
  if (!nombre.ok) return nombre;
  const nota = parseNota(body?.nota);
  if (!nota.ok) return nota;
  const lat = parseCoord(body?.lat, "coordenada_invalida");
  if (!lat.ok) return lat;
  const lng = parseCoord(body?.lng, "coordenada_invalida");
  if (!lng.ok) return lng;
  if (!enCaja(lat.value, lng.value)) return fail("fuera_de_zona");
  const key = parseIdempotencyKey(body?.idempotency_key);
  if (!key.ok) return key;
  return {
    ok: true,
    value: {
      nombre: nombre.value,
      nota: nota.value,
      lat: lat.value,
      lng: lng.value,
      idempotency_key: key.value,
    },
  };
}

function parseCantidad(raw) {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 999) return fail("cantidad_invalida");
  return { ok: true, value: n };
}

export function validateMovimiento(body) {
  const tipo = trimOrNull(body?.tipo);
  if (tipo !== "entra" && tipo !== "sale") return fail("tipo_invalido");
  const key = parseIdempotencyKey(body?.idempotency_key);
  if (!key.ok) return key;

  const texto = trimOrNull(body?.texto);
  if (texto) {
    if (texto.length > 280) return fail("texto_invalido");
    return {
      ok: true,
      value: {
        tipo,
        texto,
        categoria: null,
        cantidad: null,
        idempotency_key: key.value,
      },
    };
  }

  const categoria = trimOrNull(body?.categoria);
  if (!categoria || !CATEGORIAS.includes(categoria)) {
    return fail("categoria_invalida");
  }
  const cantidad = parseCantidad(body?.cantidad ?? 1);
  if (!cantidad.ok) return cantidad;
  return {
    ok: true,
    value: {
      tipo,
      texto: null,
      categoria,
      cantidad: cantidad.value,
      idempotency_key: key.value,
    },
  };
}

export function validatePuntoId(raw) {
  const id = trimOrNull(raw);
  if (!id || !UUID_RE.test(id)) return fail("no_encontrado", 404);
  return { ok: true, value: id };
}
