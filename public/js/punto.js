import {
  getPunto,
  postMovimiento,
  interpretarVoz,
  listProductos,
  createProducto,
  uploadFotoProducto,
} from "./api.js";
import {
  CATEGORIAS,
  newKey,
  formatWhen,
  errorText,
} from "./categorias.js";
import { canSpeak, createDictado } from "./voz.js";

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
    name.className = "stock-name";
    if (item.foto && item.producto_id) {
      const img = document.createElement("img");
      img.src = item.foto;
      img.alt = "";
      img.className = "stock-foto";
      name.append(img);
    }
    name.append(item.nombre || item.etiqueta || item.categoria);
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
    return data;
  } catch (err) {
    status.textContent = errorText(err);
    status.classList.add("is-error");
    return null;
  }
}

function renderRevision(items, onChange) {
  const list = qs("revision-lista");
  list.replaceChildren();
  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "revision-item";

    const qty = document.createElement("input");
    qty.type = "number";
    qty.min = "1";
    qty.max = "999";
    qty.value = String(item.cantidad);
    qty.setAttribute("aria-label", "Cantidad");
    qty.addEventListener("input", () => {
      const n = Number(qty.value);
      items[index].cantidad = Number.isInteger(n) ? n : items[index].cantidad;
    });

    const sel = document.createElement("select");
    sel.setAttribute("aria-label", "Categoría");
    for (const [slug, label] of CATEGORIAS) {
      const opt = document.createElement("option");
      opt.value = slug;
      opt.textContent = label;
      if (slug === item.categoria) opt.selected = true;
      sel.append(opt);
    }
    sel.addEventListener("change", () => {
      items[index].categoria = sel.value;
    });

    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "btn btn-quitar";
    quitar.textContent = "Quitar";
    quitar.addEventListener("click", () => {
      items.splice(index, 1);
      onChange();
    });

    const frase = document.createElement("p");
    frase.className = "revision-frase";
    frase.textContent = item.frase || "";

    li.append(qty, sel, quitar);
    if (item.frase) li.append(frase);
    list.append(li);
  });
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
  const panel = qs("productos");
  const lista = qs("productos-lista");
  const pStatus = qs("producto-status");
  let categoriaActiva = null;

  async function abrirCategoria(slug, label) {
    categoriaActiva = slug;
    qs("productos-titulo").textContent = label;
    panel.hidden = false;
    cats.hidden = true;
    pStatus.textContent = "";
    lista.replaceChildren();
    try {
      const data = await listProductos({ categoria: slug });
      if (data.productos.length === 0) {
        const empty = document.createElement("p");
        empty.className = "hint";
        empty.textContent = "Aún no hay productos aquí. Crea el primero.";
        lista.append(empty);
      }
      for (const p of data.productos) {
        const row = document.createElement("div");
        row.className = "producto-row";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-cat";
        if (p.foto) {
          const img = document.createElement("img");
          img.src = p.foto;
          img.alt = "";
          img.className = "stock-foto";
          btn.append(img);
        }
        btn.append(p.nombre);
        btn.addEventListener("click", () => {
          send(id, { tipo, producto_id: p.id, cantidad: 1 }, status);
        });
        const plus5 = document.createElement("button");
        plus5.type = "button";
        plus5.className = "btn btn-plus";
        plus5.textContent = "+5";
        plus5.addEventListener("click", () => {
          send(id, { tipo, producto_id: p.id, cantidad: 5 }, status);
        });
        row.append(btn, plus5);
        lista.append(row);
      }
      const gen = document.createElement("button");
      gen.type = "button";
      gen.className = "btn btn-ghost";
      gen.textContent = `+1 ${label} (sin detalle)`;
      gen.addEventListener("click", () => {
        send(id, { tipo, categoria: slug, cantidad: 1 }, status);
      });
      lista.append(gen);
    } catch (err) {
      pStatus.textContent = errorText(err);
      pStatus.classList.add("is-error");
    }
  }

  for (const [slug, label] of CATEGORIAS) {
    const plus1 = document.createElement("button");
    plus1.type = "button";
    plus1.className = "btn btn-cat";
    plus1.textContent = label;
    plus1.addEventListener("click", () => abrirCategoria(slug, label));
    const plus5 = document.createElement("button");
    plus5.type = "button";
    plus5.className = "btn btn-plus";
    plus5.textContent = "+5";
    plus5.addEventListener("click", () => {
      send(id, { tipo, categoria: slug, cantidad: 5 }, status);
    });
    cats.append(plus1, plus5);
  }

  qs("productos-cerrar").addEventListener("click", () => {
    panel.hidden = true;
    cats.hidden = false;
    categoriaActiva = null;
  });

  qs("producto-nuevo").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!categoriaActiva) return;
    const nombre = qs("producto-nombre").value.trim();
    if (nombre.length < 2) {
      pStatus.textContent = "Pon un nombre de al menos 2 letras.";
      pStatus.classList.add("is-error");
      return;
    }
    pStatus.textContent = "Creando…";
    pStatus.classList.remove("is-error", "is-ok");
    try {
      const created = await createProducto({ nombre, categoria: categoriaActiva });
      const file = qs("producto-foto").files[0];
      if (file) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const mime = file.type || "image/jpeg";
        const imagen_base64 = String(dataUrl).split(",")[1] || "";
        await uploadFotoProducto(created.id, { imagen_base64, mime });
      }
      qs("producto-nombre").value = "";
      qs("producto-foto").value = "";
      pStatus.textContent = "Producto listo. Tócalo para registrar.";
      pStatus.classList.add("is-ok");
      const label = CATEGORIAS.find((c) => c[0] === categoriaActiva)?.[1];
      await abrirCategoria(categoriaActiva, label || categoriaActiva);
    } catch (err) {
      if (err.code === "posible_duplicado" && err.candidatos?.[0]) {
        pStatus.textContent = `¿Es “${err.candidatos[0].nombre}”? Usa ese, no crees otro.`;
      } else {
        pStatus.textContent = errorText(err);
      }
      pStatus.classList.add("is-error");
    }
  });

  const draft = { items: [], textos: [] };
  const revision = qs("revision");
  const dictado = qs("dictado");
  const mic = qs("mic");
  let listener = null;
  let organizando = false;

  function showRevision() {
    revision.hidden = draft.items.length === 0;
    qs("revision-texto").textContent = draft.textos.join(" · ");
    renderRevision(draft.items, showRevision);
  }

  async function organizar(texto, append) {
    const clean = String(texto || "").trim();
    if (!clean) {
      status.textContent = "No hay texto para organizar.";
      status.classList.add("is-error");
      return;
    }
    if (organizando) return;
    organizando = true;
    status.textContent = "Organizando…";
    status.classList.remove("is-error", "is-ok");
    try {
      const data = await interpretarVoz(clean);
      if (!append) {
        draft.items = [];
        draft.textos = [];
      } else if (draft.textos[draft.textos.length - 1] === data.texto) {
        return;
      }
      draft.textos.push(data.texto);
      draft.items.push(...data.items);
      dictado.value = draft.textos.join(" ");
      showRevision();
      status.textContent = `${draft.items.length} insumo(s). Revisa cantidad y categoría, luego confirma.`;
      status.classList.add("is-ok");
    } catch (err) {
      status.textContent = errorText(err);
      status.classList.add("is-error");
    } finally {
      organizando = false;
    }
  }

  function stopMic() {
    if (listener) {
      listener.stop();
      listener = null;
    }
    mic.classList.remove("is-listening");
    mic.textContent = "Dictar insumos";
  }

  qs("btn-organizar").addEventListener("click", () => {
    organizar(dictado.value, false);
  });

  qs("revision-cancelar").addEventListener("click", () => {
    draft.items = [];
    draft.textos = [];
    revision.hidden = true;
    status.textContent = "";
  });

  qs("revision-mas").addEventListener("click", () => {
    dictado.focus();
    status.textContent = "Dicta o escribe más y organízalos.";
  });

  qs("revision-guardar").addEventListener("click", async () => {
    const items = draft.items
      .map((it) => ({
        categoria: it.categoria,
        cantidad: it.cantidad,
        frase: it.frase,
      }))
      .filter((it) => it.cantidad >= 1 && it.cantidad <= 999);
    if (items.length === 0) {
      status.textContent = "No queda nada para guardar.";
      status.classList.add("is-error");
      return;
    }
    const saved = await send(id, { tipo, items }, status);
    if (saved) {
      draft.items = [];
      draft.textos = [];
      revision.hidden = true;
      dictado.value = "";
    }
  });

  if (!canSpeak()) {
    qs("mic-hint").textContent =
      "Este navegador no dicta. Escribe la lista y toca Organizar.";
  } else {
    qs("mic-hint").textContent =
      "Habla varios productos. Al terminar, toca de nuevo para organizarlos.";
    mic.addEventListener("click", () => {
      if (listener) {
        listener.stop();
        return;
      }
      mic.classList.add("is-listening");
      mic.textContent = "Escuchando… toca para terminar";
      status.textContent = "Habla ahora: cantidades y productos.";
      status.classList.remove("is-error", "is-ok");
      listener = createDictado({
        onPartial: (text) => {
          dictado.value = text;
        },
        onReady: (text) => {
          listener = null;
          stopMic();
          organizar(text, draft.items.length > 0);
        },
        onError: () => {
          listener = null;
          stopMic();
          status.textContent =
            "No se pudo dictar. Escribe la lista o revisa el micrófono.";
          status.classList.add("is-error");
        },
      });
      try {
        listener.start();
      } catch {
        listener = null;
        stopMic();
        status.textContent = "No se pudo encender el micrófono.";
        status.classList.add("is-error");
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
