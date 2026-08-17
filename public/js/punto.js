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
  CAT_MARK,
  ETIQUETA,
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

function groupInventario(inventario) {
  const byCat = new Map();
  for (const item of inventario || []) {
    const slug = item.categoria;
    if (!byCat.has(slug)) byCat.set(slug, []);
    byCat.get(slug).push(item);
  }
  return CATEGORIAS.filter(([slug]) => byCat.has(slug)).map(([slug, label]) => {
    const items = byCat.get(slug).slice().sort((a, b) => b.stock - a.stock);
    return {
      slug,
      label,
      items,
      total: items.reduce((sum, item) => sum + item.stock, 0),
    };
  });
}

function itemLabel(item) {
  if (item.producto_id) return item.nombre || item.etiqueta || "Producto";
  return "Sin detalle";
}

function renderBodega(inventario, filtro, { onFilter, onAddInCat }) {
  const chips = qs("bodega-chips");
  const aisles = qs("stock");
  const totalEl = qs("bodega-total");
  const groups = groupInventario(inventario);
  const visible = filtro ? groups.filter((g) => g.slug === filtro) : groups;
  const units = groups.reduce((sum, g) => sum + g.total, 0);

  chips.replaceChildren();
  aisles.replaceChildren();
  chips.hidden = groups.length === 0;

  if (groups.length === 0) {
    totalEl.textContent = "";
    const empty = document.createElement("div");
    empty.className = "bodega-empty";
    const lead = document.createElement("p");
    lead.textContent = "Todavía no hay nada anotado.";
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Si acaba de llegar una donación, regístrala.";
    empty.append(lead, hint);
    aisles.append(empty);
    return;
  }

  totalEl.textContent = units === 1 ? "1 unidad" : `${units} unidades`;

  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = "chip" + (filtro ? "" : " is-on");
  allChip.setAttribute("role", "tab");
  allChip.setAttribute("aria-selected", filtro ? "false" : "true");
  allChip.textContent = "Todos";
  allChip.addEventListener("click", () => onFilter(null));
  chips.append(allChip);

  for (const group of groups) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (filtro === group.slug ? " is-on" : "");
    chip.dataset.cat = group.slug;
    chip.setAttribute("role", "tab");
    chip.setAttribute("aria-selected", filtro === group.slug ? "true" : "false");
    const mark = document.createElement("span");
    mark.className = "chip-mark";
    mark.textContent = CAT_MARK[group.slug] || group.slug.slice(0, 2);
    const text = document.createElement("span");
    text.textContent = `${group.label} ${group.total}`;
    chip.append(mark, text);
    chip.addEventListener("click", () =>
      onFilter(filtro === group.slug ? null : group.slug),
    );
    chips.append(chip);
  }

  if (filtro && visible.length === 0) {
    onFilter(null);
    return;
  }

  for (const group of visible) {
    const aisle = document.createElement("section");
    aisle.className = "aisle";
    aisle.dataset.cat = group.slug;
    aisle.id = `aisle-${group.slug}`;

    const head = document.createElement("div");
    head.className = "aisle-head";

    const titleWrap = document.createElement("div");
    titleWrap.className = "aisle-title";
    const mark = document.createElement("span");
    mark.className = "cat-mark";
    mark.textContent = CAT_MARK[group.slug] || group.slug.slice(0, 2);
    const name = document.createElement("h3");
    name.className = "aisle-name";
    name.textContent = group.label;
    titleWrap.append(mark, name);

    const qty = document.createElement("p");
    qty.className = "aisle-qty";
    qty.setAttribute("aria-label", `${group.total} unidades`);
    qty.textContent = String(group.total);

    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn-ghost btn-aisle-add";
    add.textContent = "Agregar";
    add.addEventListener("click", () => onAddInCat(group.slug, group.label));

    head.append(titleWrap, qty, add);

    const bins = document.createElement("div");
    bins.className = "bins";
    if (group.items.length === 1) bins.classList.add("is-single");

    for (const item of group.items) {
      const bin = document.createElement("article");
      bin.className = "bin";
      if (item.foto && item.producto_id) {
        const img = document.createElement("img");
        img.src = item.foto;
        img.alt = "";
        img.className = "bin-foto";
        img.addEventListener("error", () => img.remove());
        bin.append(img);
      }
      const label = document.createElement("p");
      label.className = "bin-name";
      label.textContent = itemLabel(item);
      const count = document.createElement("p");
      count.className = "bin-qty";
      count.setAttribute("aria-label", `${item.stock} unidades`);
      count.textContent = String(item.stock);
      bin.append(label, count);
      bins.append(bin);
    }

    aisle.append(head, bins);
    aisles.append(aisle);
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
    const name = m.etiqueta || ETIQUETA[m.categoria] || m.categoria;
    qty.textContent = `${sign}${m.cantidad} ${name}`;
    const when = document.createElement("div");
    when.className = "meta";
    when.textContent = formatWhen(m.created_at);
    li.append(qty, when);
    list.append(li);
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
  let filtroCat = null;
  let lastData = null;
  let categoriaActiva = null;
  const toggle = qs("toggle");
  const cats = qs("cats");
  const panel = qs("productos");
  const lista = qs("productos-lista");
  const pStatus = qs("producto-status");
  const registrarPanel = qs("registrar-panel");
  const btnRegistrar = qs("btn-registrar");

  function paint(data) {
    lastData = data;
    qs("nombre").textContent = data.nombre;
    document.title = `${data.nombre} — Insumos Pereira`;
    qs("nota").textContent = data.nota || "";
    qs("meta").textContent = data.nota
      ? ""
      : `Creado ${formatWhen(data.created_at)}`;
    renderBodega(data.inventario, filtroCat, {
      onFilter: (slug) => {
        filtroCat = slug;
        if (lastData) paint(lastData);
      },
      onAddInCat: openRegistrarOn,
    });
    renderMovs(qs("movs"), data.movimientos);
  }

  function setTipo(next) {
    tipo = next;
    toggle.classList.toggle("is-sale", tipo === "sale");
    qs("btn-entra").classList.toggle("is-on", tipo === "entra");
    qs("btn-sale").classList.toggle("is-on", tipo === "sale");
    qs("registrar-titulo").textContent =
      tipo === "sale" ? "Anotar salida" : "Anotar entrada";
  }

  function setRegistrarOpen(open) {
    registrarPanel.hidden = !open;
    btnRegistrar.hidden = open;
    btnRegistrar.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      registrarPanel.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "start",
      });
    }
  }

  function openRegistrarOn(slug, label) {
    setRegistrarOpen(true);
    abrirCategoria(slug, label);
  }

  async function send(payload) {
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

  async function abrirCategoria(slug, label) {
    categoriaActiva = slug;
    qs("productos-titulo").textContent = label;
    panel.hidden = false;
    for (const btn of cats.querySelectorAll(".cat-tile")) {
      btn.classList.toggle("is-on", btn.dataset.cat === slug);
    }
    pStatus.textContent = "";
    pStatus.classList.remove("is-error", "is-ok");
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
          send({ tipo, producto_id: p.id, cantidad: 1 });
        });
        const plus5 = document.createElement("button");
        plus5.type = "button";
        plus5.className = "btn btn-plus";
        plus5.textContent = "+5";
        plus5.addEventListener("click", () => {
          send({ tipo, producto_id: p.id, cantidad: 5 });
        });
        row.append(btn, plus5);
        lista.append(row);
      }
      const gen = document.createElement("button");
      gen.type = "button";
      gen.className = "btn btn-ghost";
      gen.textContent = `+1 ${label} (sin detalle)`;
      gen.addEventListener("click", () => {
        send({ tipo, categoria: slug, cantidad: 1 });
      });
      lista.append(gen);
    } catch (err) {
      pStatus.textContent = errorText(err);
      pStatus.classList.add("is-error");
    }
  }

  qs("btn-entra").addEventListener("click", () => setTipo("entra"));
  qs("btn-sale").addEventListener("click", () => setTipo("sale"));
  setTipo("entra");

  btnRegistrar.addEventListener("click", () => setRegistrarOpen(true));
  qs("btn-registrar-cerrar").addEventListener("click", () => {
    setRegistrarOpen(false);
  });

  for (const [slug, label] of CATEGORIAS) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "cat-tile";
    tile.dataset.cat = slug;
    const mark = document.createElement("span");
    mark.className = "cat-mark";
    mark.textContent = CAT_MARK[slug] || slug.slice(0, 2);
    const name = document.createElement("span");
    name.className = "cat-tile-name";
    name.textContent = label;
    tile.append(mark, name);
    tile.addEventListener("click", () => abrirCategoria(slug, label));
    cats.append(tile);
  }

  qs("productos-cerrar").addEventListener("click", () => {
    panel.hidden = true;
    categoriaActiva = null;
    for (const btn of cats.querySelectorAll(".cat-tile")) {
      btn.classList.remove("is-on");
    }
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
      const created = await createProducto({
        nombre,
        categoria: categoriaActiva,
      });
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
    const saved = await send({ tipo, items });
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
