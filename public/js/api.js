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

export function postMovimiento(id, body) {
  return fetch(`/api/puntos/${encodeURIComponent(id)}/movimientos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(parse);
}
