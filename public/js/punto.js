import { getPunto, postMovimiento } from "./api.js";
import {
  CATEGORIAS,
  newKey,
  formatWhen,
  errorText,
} from "./categorias.js";
import { canSpeak, listenOnce } from "./voz.js";

function qs(id) {
  return document.getElementById(id);
}

function puntoId() {
  return new URLSearchParams(window.location.search).get("id") || "";
}

function renderStock(list, inventario) {
  list.replaceChildren();
  if (!inventario || inventario.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Todavía no hay insumos registrados.";
    list.append(li);
    return;
  }
  for (const item of inventario) {
    const li = document.createElement("li");
    const row = document.createElement("div");
    row.className = "stock-row";
    const name = document.createElement("span");
    name.textContent = item.etiqueta || item.categoria;
    const qty = document.createElement("span");
    qty.textContent = String(item.stock);
    row.append(name, qty);
    li.append(row);
    list.append(li);
  }
}

function renderMovs(list, movimientos) {
  list.replaceChildren();
  if (!movimientos || movimientos.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Sin movimientos todavía.";
    list.append(li);
    return;
  }
  for (const m of movimientos) {
    const li = document.createElement("li");
    const sign = m.tipo === "entra" ? "+" : "−";
    const qty = document.createElement("span");
    qty.className = m.tipo === "entra" ? "qty-entra" : "qty-sale";
    qty.textContent = `${sign}${m.cantidad} ${m.etiqueta || m.categoria}`;
    const when = document.createElement("div");
    when.className = "meta";
    when.textContent = formatWhen(m.created_at);
    li.append(qty, when);
    list.append(li);
  }
}

function paint(data) {
  qs("nombre").textContent = data.nombre;
  qs("nota").textContent = data.nota || "";
  qs("meta").textContent = data.nota
    ? ""
    : `Creado ${formatWhen(data.created_at)}`;
  renderStock(qs("stock"), data.inventario);
  renderMovs(qs("movs"), data.movimientos);
}

async function send(id, payload, status) {
  status.textContent = "Guardando…";
  status.classList.remove("is-error", "is-ok");
  try {
    const data = await postMovimiento(id, {
      ...payload,
      idempotency_key: newKey(),
    });
    paint(data);
    const extra = (data.aplicados || []).some((a) => a.ajustado)
      ? " Se ajustó a lo que había."
      : "";
    status.textContent = `Listo.${extra}`;
    status.classList.add("is-ok");
  } catch (err) {
    status.textContent = errorText(err);
    status.classList.add("is-error");
  }
}

async function main() {
  const id = puntoId();
  const status = qs("status");
  if (!id) {
    status.textContent = "Falta el punto.";
    status.classList.add("is-error");
    return;
  }

  let tipo = "entra";
  const toggle = qs("toggle");
  function setTipo(next) {
    tipo = next;
    toggle.classList.toggle("is-sale", tipo === "sale");
    qs("btn-entra").classList.toggle("is-on", tipo === "entra");
    qs("btn-sale").classList.toggle("is-on", tipo === "sale");
  }
  qs("btn-entra").addEventListener("click", () => setTipo("entra"));
  qs("btn-sale").addEventListener("click", () => setTipo("sale"));
  setTipo("entra");

  const cats = qs("cats");
  for (const [slug, label] of CATEGORIAS) {
    const plus1 = document.createElement("button");
    plus1.type = "button";
    plus1.className = "btn btn-cat";
    plus1.textContent = label;
    plus1.addEventListener("click", () => {
      send(id, { tipo, categoria: slug, cantidad: 1 }, status);
    });
    const plus5 = document.createElement("button");
    plus5.type = "button";
    plus5.className = "btn btn-plus";
    plus5.textContent = "+5";
    plus5.addEventListener("click", () => {
      send(id, { tipo, categoria: slug, cantidad: 5 }, status);
    });
    cats.append(plus1, plus5);
  }

  const mic = qs("mic");
  if (!canSpeak()) {
    mic.hidden = true;
    qs("mic-hint").textContent =
      "Este navegador no dicta. Usa los botones.";
  } else {
    mic.addEventListener("click", async () => {
      mic.classList.add("is-listening");
      mic.textContent = "Escuchando…";
      status.textContent = "Habla ahora.";
      try {
        const texto = await listenOnce();
        if (!texto) {
          status.textContent = "No se oyó nada.";
          return;
        }
        status.textContent = `Oí: ${texto}`;
        await send(id, { tipo, texto }, status);
      } catch {
        status.textContent =
          "No se pudo dictar. Revisa el micrófono o usa los botones.";
        status.classList.add("is-error");
      } finally {
        mic.classList.remove("is-listening");
        mic.textContent = "Decir el producto";
      }
    });
  }

  try {
    const data = await getPunto(id);
    paint(data);
  } catch (err) {
    status.textContent = errorText(err);
    status.classList.add("is-error");
  }
}

main();
