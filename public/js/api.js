async function parse(res) {
  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (!res.ok) {
    const err = new Error(body.error || "error_red");
    err.status = res.status;
    err.code = body.error;
    throw err;
  }
  return body;
}

export function listPuntos() {
  return fetch("/api/puntos").then(parse);
}

export function getPunto(id) {
  return fetch(`/api/puntos/${encodeURIComponent(id)}`).then(parse);
}

export function createPunto(body) {
  return fetch("/api/puntos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(parse);
}

export function interpretarVoz(texto) {
  return fetch("/api/interpretar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ texto }),
  }).then(parse);
}

export function listProductos({ categoria, q } = {}) {
  const qs = new URLSearchParams();
  if (categoria) qs.set("categoria", categoria);
  if (q) qs.set("q", q);
  const suffix = qs.toString() ? `?${qs}` : "";
  return fetch(`/api/productos${suffix}`).then(parse);
}

export function createProducto(body) {
  return fetch("/api/productos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "error_red");
      err.status = res.status;
      err.code = data.error;
      err.candidatos = data.candidatos || [];
      throw err;
    }
    return data;
  });
}

export function uploadFotoProducto(id, { imagen_base64, mime }) {
  return fetch(`/api/productos/${encodeURIComponent(id)}/foto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imagen_base64, mime }),
  }).then(parse);
}

export function postMovimiento(id, body) {
  return fetch(`/api/puntos/${encodeURIComponent(id)}/movimientos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(parse);
}

export function postOrden(puntoId, body) {
  return fetch(`/api/puntos/${encodeURIComponent(puntoId)}/ordenes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(parse);
}

export function listOrdenes(puntoId, dia) {
  const qs = new URLSearchParams();
  if (dia) qs.set("dia", dia);
  return fetch(
    `/api/puntos/${encodeURIComponent(puntoId)}/ordenes?${qs}`,
  ).then(parse);
}

export function getOrden(id) {
  return fetch(`/api/ordenes/${encodeURIComponent(id)}`).then(parse);
}
