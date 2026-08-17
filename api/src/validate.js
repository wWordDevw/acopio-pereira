import { CATEGORIAS, categoriaDesdeTexto, enCaja } from "./categorias.js";

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

  if (Array.isArray(body?.items)) {
    if (body.items.length < 1 || body.items.length > 30) {
      return fail("items_invalidos");
    }
    const items = [];
    for (const raw of body.items) {
      const categoria = trimOrNull(raw?.categoria);
      if (!categoria || !CATEGORIAS.includes(categoria)) {
        return fail("categoria_invalida");
      }
      const cantidad = parseCantidad(raw?.cantidad);
      if (!cantidad.ok) return cantidad;
      const frase = trimOrNull(raw?.frase);
      const productoId = trimOrNull(raw?.producto_id);
      if (productoId && !UUID_RE.test(productoId)) {
        return fail("producto_invalido");
      }
      items.push({
        categoria,
        cantidad: cantidad.value,
        texto_original: frase && frase.length <= 80 ? frase : null,
        producto_id: productoId,
      });
    }
    return {
      ok: true,
      value: {
        tipo,
        texto: null,
        items,
        categoria: null,
        cantidad: null,
        idempotency_key: key.value,
      },
    };
  }

  const texto = trimOrNull(body?.texto);
  if (texto) {
    if (texto.length > 500) return fail("texto_invalido");
    return {
      ok: true,
      value: {
        tipo,
        texto,
        items: null,
        categoria: null,
        cantidad: null,
        idempotency_key: key.value,
      },
    };
  }

  const productoId = trimOrNull(body?.producto_id);
  if (productoId) {
    if (!UUID_RE.test(productoId)) return fail("producto_invalido");
    const cantidad = parseCantidad(body?.cantidad ?? 1);
    if (!cantidad.ok) return cantidad;
    return {
      ok: true,
      value: {
        tipo,
        texto: null,
        items: null,
        categoria: null,
        producto_id: productoId,
        cantidad: cantidad.value,
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
      items: null,
      categoria,
      producto_id: null,
      cantidad: cantidad.value,
      idempotency_key: key.value,
    },
  };
}

export function validateProducto(body) {
  const nombre = trimOrNull(body?.nombre);
  if (!nombre || nombre.length < 2 || nombre.length > 60) {
    return fail("nombre_invalido");
  }
  if (hasForbiddenUrl(nombre)) return fail("url_no_permitida");
  const categoria = trimOrNull(body?.categoria);
  if (!categoria || !CATEGORIAS.includes(categoria)) {
    return fail("categoria_invalida");
  }
  return { ok: true, value: { nombre, categoria } };
}

export function validateFoto(body) {
  const mime = trimOrNull(body?.mime) || "image/jpeg";
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    return fail("foto_invalida");
  }
  const raw = trimOrNull(body?.imagen_base64);
  if (!raw) return fail("foto_invalida");
  const b64 = raw.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
  if (b64.length > 1_200_000) return fail("foto_grande");
  return { ok: true, value: { mime, imagen_base64: b64 } };
}

export function validateInterpretar(body) {
  const texto = trimOrNull(body?.texto);
  if (!texto || texto.length > 500) return fail("texto_invalido");
  return { ok: true, value: { texto } };
}

export function validatePuntoId(raw) {
  const id = trimOrNull(raw);
  if (!id || !UUID_RE.test(id)) return fail("no_encontrado", 404);
  return { ok: true, value: id };
}

function parseBool(raw) {
  if (raw == null || raw === "") return false;
  const s = String(raw).trim().toLowerCase();
  return s === "1" || s === "true" || s === "si" || s === "sí" || s === "yes";
}

function parseLimit(raw, fallback) {
  if (raw == null || raw === "") return { ok: true, value: fallback };
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1 || n > 200) return fail("limit_invalido");
  return { ok: true, value: n };
}

export function validateConsulta(params) {
  const qRaw = trimOrNull(params?.q);
  if (qRaw && qRaw.length > 80) return fail("q_invalida");
  if (qRaw && hasForbiddenUrl(qRaw)) return fail("url_no_permitida");

  let categoria = trimOrNull(params?.categoria);
  if (categoria && !CATEGORIAS.includes(categoria)) {
    return fail("categoria_invalida");
  }

  let q = qRaw;
  if (!categoria && q) {
    const inferred = categoriaDesdeTexto(q);
    if (inferred) {
      categoria = inferred;
      q = null;
    }
  }

  const con_stock = parseBool(params?.con_stock) || Boolean(categoria);

  const hasLat = params?.lat != null && params.lat !== "";
  const hasLng = params?.lng != null && params.lng !== "";
  if (hasLat !== hasLng) return fail("coordenada_invalida");

  let lat = null;
  let lng = null;
  let radio = 5;
  if (hasLat && hasLng) {
    const latP = parseCoord(params.lat, "coordenada_invalida");
    if (!latP.ok) return latP;
    const lngP = parseCoord(params.lng, "coordenada_invalida");
    if (!lngP.ok) return lngP;
    lat = latP.value;
    lng = lngP.value;
    if (params?.radio != null && params.radio !== "") {
      const r = Number(String(params.radio).trim());
      if (!Number.isFinite(r) || r < 0.1 || r > 50) return fail("radio_invalido");
      radio = r;
    }
  }

  const limit = parseLimit(params?.limit, 200);
  if (!limit.ok) return limit;

  return {
    ok: true,
    value: {
      q,
      categoria,
      con_stock,
      lat,
      lng,
      radio,
      limit: limit.value,
    },
  };
}
