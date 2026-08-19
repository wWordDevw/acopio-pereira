import {
  getPunto,
  postMovimiento,
  postOrden,
  listOrdenes,
  getOrden,
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

let toastTimer = 0;

function hideToast() {
  const el = qs("toast");
  if (!el) return;
  el.hidden = true;
  el.classList.remove("is-on", "is-error");
  el.textContent = "";
}

function showToast(message, kind = "ok") {
  const el = qs("toast");
  if (!el) return;
  window.clearTimeout(toastTimer);
  el.textContent = message;
  el.classList.toggle("is-error", kind === "error");
  el.hidden = false;
  el.classList.remove("is-on");
  void el.offsetWidth;
  el.classList.add("is-on");
  toastTimer = window.setTimeout(hideToast, 3200);
}

function mensajeMovimiento(tipo, cantidad, nombre, ajustado) {
  const n = Number(cantidad) || 0;
  const verb =
    tipo === "sale" ? (n === 1 ? "Salió" : "Salieron") : n === 1 ? "Entró" : "Entraron";
  const what = nombre ? ` ${nombre}` : "";
  const extra = ajustado ? " Se ajustó a lo que había." : "";
  return `${verb} ${n}${what}.${extra}`;
}

function hoyLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readFileAsFoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const mime = file.type || "image/jpeg";
      const imagen_base64 = String(reader.result).split(",")[1] || "";
      resolve({ imagen_base64, mime });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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

// Cuánto hace que se movió una línea. El dato crudo es lo que separa un
// inventario confiable de una lista vieja, así que se muestra siempre y se
// resalta cuando pasa de un día.
const STALE_MS = 24 * 60 * 60 * 1000;

function haceCuanto(iso) {
  if (!iso) return { texto: "sin registro", viejo: true };
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return { texto: "", viejo: false };
  const ms = Date.now() - d.getTime();
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return { texto: `hace ${min} min`, viejo: false };
  const h = Math.round(min / 60);
  if (h < 24) return { texto: `hace ${h} h`, viejo: false };
  const dias = Math.round(h / 24);
  return { texto: `hace ${dias} d`, viejo: true };
}

const TOPE_POR_GRUPO = 4;
const expandidos = new Set();

function filaStock(item) {
  const row = document.createElement("div");
  row.className = "stock-row";
  if (item.estado === "agotado") row.classList.add("is-agotado");
  if (item.estado === "bajo") row.classList.add("is-bajo");

  const name = document.createElement("div");
  name.className = "stock-name";
  name.append(document.createTextNode(itemLabel(item)));
  if (item.estado === "agotado" || item.estado === "bajo") {
    const nota = document.createElement("small");
    nota.className = "stock-note";
    nota.textContent =
      item.estado === "agotado"
        ? "Se acabó"
        : `Queda poco · mínimo ${item.minimo}`;
    name.append(nota);
  }

  const qty = document.createElement("div");
  qty.className = "stock-qty";
  qty.setAttribute("aria-label", `${item.stock} unidades`);
  qty.append(document.createTextNode(String(item.stock)));
  const u = document.createElement("span");
  u.textContent = "u";
  qty.append(u);

  const when = document.createElement("small");
  when.className = "stock-when";
  const h = haceCuanto(item.movido_at);
  if (h.viejo) when.classList.add("is-stale");
  when.textContent = h.texto;
  name.append(when);

  row.append(name, qty);
  return row;
}

function renderBodega(inventario, filtro, { onFilter, onAddInCat, repaint }) {
  const chips = qs("bodega-chips");
  const aisles = qs("stock");
  const totalEl = qs("bodega-total");
  const statsEl = qs("bodega-stats");
  const groups = groupInventario(inventario);
  const todas = groups.flatMap((g) => g.items);
  const units = todas.reduce((sum, i) => sum + i.stock, 0);
  const faltan = todas.filter((i) => i.estado !== "ok");

  chips.replaceChildren();
  aisles.replaceChildren();
  if (statsEl) statsEl.replaceChildren();
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

  totalEl.textContent = "";

  if (statsEl) {
    const reciente = todas
      .map((i) => i.movido_at)
      .filter(Boolean)
      .sort()
      .pop();
    const h = haceCuanto(reciente);
    for (const [k, v, stale] of [
      ["Unidades", units.toLocaleString("es-CO"), false],
      ["Productos", String(todas.length), false],
      ["Actualizado", h.texto, h.viejo],
    ]) {
      const cell = document.createElement("div");
      cell.className = "bodega-stat";
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      if (stale) dd.classList.add("is-stale");
      cell.append(dt, dd);
      statsEl.append(cell);
    }
  }

  const chip = (texto, cuenta, activo, onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (activo ? " is-on" : "");
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", activo ? "true" : "false");
    b.append(document.createTextNode(texto));
    if (cuenta != null) {
      const c = document.createElement("span");
      c.className = "chip-count";
      c.textContent = String(cuenta);
      b.append(c);
    }
    b.addEventListener("click", onClick);
    chips.append(b);
  };

  chip("Todo", todas.length, !filtro, () => onFilter(null));
  if (faltan.length) {
    chip("Falta", faltan.length, filtro === "__falta", () =>
      onFilter(filtro === "__falta" ? null : "__falta"),
    );
  }
  for (const g of groups) {
    chip(g.label, g.items.length, filtro === g.slug, () =>
      onFilter(filtro === g.slug ? null : g.slug),
    );
  }

  const head = document.createElement("div");
  head.className = "stock-head";
  for (const t of ["Producto", "Existencia"]) {
    const s = document.createElement("span");
    s.textContent = t;
    head.append(s);
  }
  aisles.append(head);

  // «Falta» atraviesa las categorías: es una sola lista, ordenada por urgencia.
  if (filtro === "__falta") {
    const orden = { agotado: 0, bajo: 1 };
    for (const item of faltan.slice().sort(
      (a, b) => orden[a.estado] - orden[b.estado] || a.stock - b.stock,
    )) {
      aisles.append(filaStock(item));
    }
    return;
  }

  const visibles = filtro ? groups.filter((g) => g.slug === filtro) : groups;
  if (filtro && visibles.length === 0) {
    onFilter(null);
    return;
  }

  for (const group of visibles) {
    const sec = document.createElement("div");
    sec.className = "stock-group";
    sec.textContent = `${group.label} · ${group.total.toLocaleString("es-CO")} u`;
    aisles.append(sec);

    // Lo escaso primero: agotado, luego poco, luego el resto.
    const peso = { agotado: 0, bajo: 1, ok: 2 };
    const items = group.items
      .slice()
      .sort((a, b) => peso[a.estado] - peso[b.estado] || b.stock - a.stock);

    const abierto = filtro === group.slug || expandidos.has(group.slug);
    const mostrar = abierto ? items : items.slice(0, TOPE_POR_GRUPO);
    for (const item of mostrar) aisles.append(filaStock(item));

    if (!abierto && items.length > TOPE_POR_GRUPO) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "stock-more";
      more.textContent = `Ver los ${items.length} de ${group.label.toLowerCase()}`;
      more.addEventListener("click", () => {
        expandidos.add(group.slug);
        repaint();
      });
      aisles.append(more);
    }


  }
}


function renderMovs(list, movimientos, onOpenOrden) {
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
    if (m.orden_id) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "orden-chip";
      chip.textContent = `Lote ${formatWhen(m.orden_abierta_at)}`;
      chip.addEventListener("click", () => onOpenOrden(m.orden_id));
      li.append(chip);
    }
    list.append(li);
  }
}

function renderOrdenes(list, ordenes, onOpenOrden) {
  list.replaceChildren();
  if (!ordenes || ordenes.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Sin órdenes hoy.";
    list.append(li);
    return;
  }
  for (const o of ordenes) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "orden-row";
    const hora = document.createElement("span");
    hora.className = "orden-row-hora";
    hora.textContent = formatWhen(o.abierta_at);
    const tipo = document.createElement("span");
    tipo.className =
      "orden-row-tipo " + (o.tipo === "sale" ? "qty-sale" : "qty-entra");
    tipo.textContent = o.tipo === "sale" ? "Sale" : "Entra";
    const resumen = document.createElement("span");
    resumen.className = "orden-row-resumen";
    const nItems = Number(o.lineas) || 0;
    const nUnd = Number(o.unidades) || 0;
    const itemsLabel = nItems === 1 ? "1 ítem" : `${nItems} ítems`;
    const undLabel = nUnd === 1 ? "1 und." : `${nUnd} und.`;
    resumen.textContent = `${itemsLabel} · ${undLabel}`;
    btn.append(hora, tipo, resumen);
    if (o.foto) {
      const img = document.createElement("img");
      img.src = o.foto;
      img.alt = "";
      img.className = "orden-row-foto";
      img.addEventListener("error", () => img.remove());
      btn.append(img);
    }
    btn.addEventListener("click", () => onOpenOrden(o.id));
    li.append(btn);
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
  qs("toast").addEventListener("click", hideToast);
  if (!id) {
    status.textContent = "Falta el punto.";
    status.classList.add("is-error");
    return;
  }

  let tipo = "entra";
  let modo = "suelto";
  let filtroCat = null;
  let lastData = null;
  let categoriaActiva = null;
  let loteDraft = null;
  let loteEnviando = false;
  const toggle = qs("toggle");
  const cats = qs("cats");
  const panel = qs("productos");
  const lista = qs("productos-lista");
  const pStatus = qs("producto-status");
  const acciones = qs("registrar-acciones");
  const registrarPanel = qs("registrar-panel");
  const btnRegistrar = qs("btn-registrar");
  const lotePanel = qs("lote-panel");
  const btnLote = qs("btn-lote");
  const loteToggle = qs("lote-toggle");

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
      repaint: () => {
        if (lastData) paint(lastData);
      },
    });
    renderMovs(qs("movs"), data.movimientos, openOrdenFicha);
    loadOrdenes();
  }

  function hideOrdenFicha() {
    qs("orden-ficha").hidden = true;
    document.body.classList.remove("is-ficha-open");
  }

  function fillOrdenFicha(orden) {
    qs("orden-ficha-hora").textContent = formatWhen(orden.abierta_at);
    const tipoEl = qs("orden-ficha-tipo");
    tipoEl.textContent = orden.tipo === "sale" ? "Sale" : "Entra";
    tipoEl.className =
      "orden-ficha-tipo " + (orden.tipo === "sale" ? "qty-sale" : "qty-entra");
    const notaEl = qs("orden-ficha-nota");
    if (orden.nota) {
      notaEl.textContent = orden.nota;
      notaEl.hidden = false;
    } else {
      notaEl.textContent = "";
      notaEl.hidden = true;
    }
    const fotoEl = qs("orden-ficha-foto");
    if (orden.foto) {
      fotoEl.src = orden.foto;
      fotoEl.hidden = false;
    } else {
      fotoEl.removeAttribute("src");
      fotoEl.hidden = true;
    }
    const lineasEl = qs("orden-ficha-lineas");
    lineasEl.replaceChildren();
    for (const linea of orden.lineas || []) {
      const li = document.createElement("li");
      li.className = "lote-linea";
      if (linea.foto) {
        const img = document.createElement("img");
        img.src = linea.foto;
        img.alt = "";
        img.className = "orden-ficha-linea-foto";
        img.addEventListener("error", () => img.remove());
        li.append(img);
      }
      const name = document.createElement("span");
      name.className = "orden-ficha-linea-nombre";
      name.textContent =
        linea.nombre ||
        linea.etiqueta ||
        ETIQUETA[linea.categoria] ||
        linea.categoria;
      const qty = document.createElement("span");
      qty.className = "orden-ficha-linea-qty";
      qty.textContent = String(linea.cantidad);
      li.append(name, qty);
      lineasEl.append(li);
    }
    qs("orden-ficha").hidden = false;
    document.body.classList.add("is-ficha-open");
    qs("btn-orden-ficha-cerrar").focus();
  }

  async function openOrdenFicha(ordenId) {
    try {
      const orden = await getOrden(ordenId);
      fillOrdenFicha(orden);
    } catch (err) {
      status.textContent = errorText(err);
      status.classList.remove("is-ok");
      status.classList.add("is-error");
    }
  }

  async function loadOrdenes() {
    const list = qs("ordenes-lista");
    try {
      const data = await listOrdenes(id, hoyLocal());
      renderOrdenes(list, data.ordenes || [], openOrdenFicha);
    } catch (err) {
      list.replaceChildren();
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = errorText(err);
      list.append(li);
    }
  }

  function setTipo(next) {
    tipo = next;
    toggle.classList.toggle("is-sale", tipo === "sale");
    qs("btn-entra").classList.toggle("is-on", tipo === "entra");
    qs("btn-sale").classList.toggle("is-on", tipo === "sale");
    qs("registrar-titulo").textContent =
      tipo === "sale" ? "Anotar salida" : "Anotar entrada";
  }

  function scrollPanel(el) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  }

  function loteDirty() {
    return Boolean(loteDraft && (loteDraft.lineas.length > 0 || loteDraft.fotoFile));
  }

  function mountPicker(host) {
    for (const el of [qs("cats"), qs("productos"), qs("dictar-box")]) {
      if (el) host.append(el);
    }
  }

  function syncAcciones() {
    const loteOpen = Boolean(loteDraft) && !lotePanel.hidden;
    const regOpen = !registrarPanel.hidden;
    btnRegistrar.hidden = loteOpen || regOpen;
    btnLote.hidden = loteOpen;
    acciones.hidden = btnRegistrar.hidden && btnLote.hidden;
    btnRegistrar.setAttribute("aria-expanded", regOpen ? "true" : "false");
    btnLote.setAttribute("aria-expanded", loteOpen ? "true" : "false");
  }

  function setRegistrarOpen(open) {
    registrarPanel.hidden = !open;
    if (open) lotePanel.hidden = true;
    syncAcciones();
    if (open) scrollPanel(registrarPanel);
  }

  function setLoteOpen(open) {
    lotePanel.hidden = !open;
    if (open) registrarPanel.hidden = true;
    syncAcciones();
    if (open) scrollPanel(lotePanel);
  }

  function setLoteTipo(next) {
    if (!loteDraft) return;
    loteDraft.tipo = next;
    loteToggle.classList.toggle("is-sale", next === "sale");
    qs("lote-entra").classList.toggle("is-on", next === "entra");
    qs("lote-sale").classList.toggle("is-on", next === "sale");
  }

  function renderLoteLineas() {
    const list = qs("lote-lineas");
    list.replaceChildren();
    if (!loteDraft || loteDraft.lineas.length === 0) {
      const li = document.createElement("li");
      li.className = "hint";
      li.textContent = "Todavía no hay insumos en este lote.";
      list.append(li);
      return;
    }
    loteDraft.lineas.forEach((linea, index) => {
      const li = document.createElement("li");
      li.className = "revision-item lote-linea";
      const qty = document.createElement("span");
      qty.textContent = String(linea.cantidad);
      const name = document.createElement("span");
      name.textContent = linea.nombre;
      const quitar = document.createElement("button");
      quitar.type = "button";
      quitar.className = "btn btn-quitar";
      quitar.textContent = "Quitar";
      quitar.addEventListener("click", () => {
        loteDraft.lineas.splice(index, 1);
        renderLoteLineas();
      });
      li.append(qty, name, quitar);
      list.append(li);
    });
  }

  function renderLoteFoto() {
    const file = loteDraft && loteDraft.fotoFile;
    const nombre = qs("lote-foto-nombre");
    nombre.textContent = file ? file.name : "";
    nombre.hidden = !file;
    qs("btn-lote-quitar-foto").hidden = !file;
  }

  function addLinea({ producto_id, categoria, nombre, cantidad }) {
    if (!loteDraft) return;
    const n = Number(cantidad);
    if (!Number.isInteger(n) || n < 1) return;
    const slug = categoria || categoriaActiva;
    const existing = loteDraft.lineas.find((l) =>
      producto_id
        ? l.producto_id === producto_id
        : !l.producto_id && l.categoria === slug,
    );
    if (existing) {
      existing.cantidad = Math.min(999, existing.cantidad + n);
    } else if (loteDraft.lineas.length >= 30) {
      status.textContent = "El lote ya tiene 30 insumos.";
      status.classList.add("is-error");
      return;
    } else {
      loteDraft.lineas.push({
        producto_id: producto_id || undefined,
        categoria: slug,
        nombre:
          nombre || ETIQUETA[slug] || slug || "Insumo",
        cantidad: Math.min(999, n),
      });
    }
    renderLoteLineas();
  }

  function resetLote() {
    modo = "suelto";
    loteDraft = null;
    loteEnviando = false;
    qs("lote-foto").value = "";
    qs("lote-foto-nombre").textContent = "";
    qs("btn-lote-quitar-foto").hidden = true;
    qs("revision-guardar").textContent = "Confirmar e ingresar";
    mountPicker(registrarPanel);
    setLoteOpen(false);
  }

  function discardLoteIfNeeded() {
    if (loteEnviando) return false;
    if (!loteDraft) return true;
    if (loteDirty() && !confirm("¿Descartar este lote?")) return false;
    resetLote();
    return true;
  }

  function openLote() {
    if (loteDraft) {
      setLoteOpen(true);
      return;
    }
    const abiertaAt = new Date();
    modo = "lote";
    loteDraft = {
      tipo: "entra",
      abiertaAt,
      dia: hoyLocal(abiertaAt),
      lineas: [],
      fotoFile: null,
      idempotency_key: newKey(),
    };
    qs("lote-hora").textContent = `Lote de las ${formatWhen(abiertaAt.toISOString())}`;
    qs("revision-guardar").textContent = "Agregar al lote";
    setLoteTipo("entra");
    renderLoteLineas();
    renderLoteFoto();
    mountPicker(qs("lote-picker"));
    setLoteOpen(true);
  }

  function openRegistrarOn(slug, label) {
    if (!discardLoteIfNeeded()) return;
    setRegistrarOpen(true);
    abrirCategoria(slug, label);
  }

  async function send(payload, { nombre } = {}) {
    status.textContent = "";
    status.classList.remove("is-error", "is-ok");
    try {
      const data = await postMovimiento(id, {
        ...payload,
        idempotency_key: newKey(),
      });
      paint(data);
      const rows = data.aplicados || [];
      const ajustado = rows.some((a) => a.ajustado);
      let qty = payload.cantidad;
      let label = nombre;
      if (Array.isArray(payload.items) && payload.items.length > 0) {
        qty = payload.items.reduce((sum, it) => sum + (it.cantidad || 0), 0);
        label =
          payload.items.length === 1
            ? nombre || ETIQUETA[payload.items[0].categoria] || ""
            : `${payload.items.length} insumos`;
      } else if (!label && payload.categoria) {
        label = ETIQUETA[payload.categoria] || payload.categoria;
      } else if (!label && rows.length === 1) {
        label = rows[0].etiqueta || "";
      }
      showToast(mensajeMovimiento(tipo, qty, label, ajustado), "ok");
      return data;
    } catch (err) {
      showToast(errorText(err), "error");
      return null;
    }
  }

  function registrar(payload, nombre) {
    if (modo === "lote") {
      addLinea({
        producto_id: payload.producto_id,
        categoria: payload.categoria || categoriaActiva,
        nombre,
        cantidad: payload.cantidad,
      });
      return;
    }
    return send(payload, { nombre });
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
          registrar({ tipo, producto_id: p.id, cantidad: 1 }, p.nombre);
        });
        const plus5 = document.createElement("button");
        plus5.type = "button";
        plus5.className = "btn btn-plus";
        plus5.textContent = "+5";
        plus5.addEventListener("click", () => {
          registrar({ tipo, producto_id: p.id, cantidad: 5 }, p.nombre);
        });
        row.append(btn, plus5);
        lista.append(row);
      }
      if (modo === "lote") {
        const gen = document.createElement("button");
        gen.type = "button";
        gen.className = "btn btn-ghost";
        gen.textContent = `+1 ${label} (sin detalle)`;
        gen.addEventListener("click", () => {
          registrar(
            { tipo, categoria: slug, cantidad: 1 },
            `${label} (sin detalle)`,
          );
        });
        lista.append(gen);
      }
    } catch (err) {
      pStatus.textContent = errorText(err);
      pStatus.classList.add("is-error");
    }
  }

  qs("btn-entra").addEventListener("click", () => setTipo("entra"));
  qs("btn-sale").addEventListener("click", () => setTipo("sale"));
  setTipo("entra");

  btnRegistrar.addEventListener("click", () => {
    if (!discardLoteIfNeeded()) return;
    setRegistrarOpen(true);
  });
  qs("btn-registrar-cerrar").addEventListener("click", () => {
    setRegistrarOpen(false);
  });

  btnLote.addEventListener("click", () => {
    setRegistrarOpen(false);
    openLote();
  });
  qs("btn-lote-cerrar").addEventListener("click", () => {
    discardLoteIfNeeded();
  });
  qs("btn-orden-ficha-cerrar").addEventListener("click", hideOrdenFicha);
  qs("lote-entra").addEventListener("click", () => setLoteTipo("entra"));
  qs("lote-sale").addEventListener("click", () => setLoteTipo("sale"));
  qs("lote-foto").addEventListener("change", () => {
    if (!loteDraft) return;
    loteDraft.fotoFile = qs("lote-foto").files[0] || null;
    renderLoteFoto();
  });
  qs("btn-lote-quitar-foto").addEventListener("click", () => {
    if (!loteDraft) return;
    loteDraft.fotoFile = null;
    qs("lote-foto").value = "";
    renderLoteFoto();
  });
  qs("btn-lote-confirmar").addEventListener("click", async () => {
    if (!loteDraft || loteEnviando) return;
    if (loteDraft.lineas.length === 0) {
      status.textContent = "Agrega al menos un insumo";
      status.classList.remove("is-ok");
      status.classList.add("is-error");
      return;
    }
    loteEnviando = true;
    status.textContent = "Guardando…";
    status.classList.remove("is-error", "is-ok");
    const n = loteDraft.lineas.reduce((sum, l) => sum + l.cantidad, 0);
    const when = formatWhen(loteDraft.abiertaAt.toISOString());
    const tipoLote = loteDraft.tipo;
    const fotoFile = loteDraft.fotoFile;
    const body = {
      tipo: tipoLote,
      abierta_at: loteDraft.abiertaAt.toISOString(),
      dia: loteDraft.dia,
      lineas: loteDraft.lineas.map((l) =>
        l.producto_id
          ? { producto_id: l.producto_id, cantidad: l.cantidad }
          : { categoria: l.categoria, cantidad: l.cantidad },
      ),
      idempotency_key: loteDraft.idempotency_key,
    };
    try {
      if (fotoFile) {
        body.foto = await readFileAsFoto(fotoFile);
      }
      const data = await postOrden(id, body);
      const extra = (data.aplicados || []).some((a) => a.ajustado)
        ? " Se ajustó a lo que había."
        : "";
      const verbo = tipoLote === "sale" ? "Salieron" : "Entraron";
      const unidades =
        data.orden && data.orden.unidades != null ? data.orden.unidades : n;
      paint(data);
      resetLote();
      qs("ordenes-fold").open = true;
      status.textContent = `${verbo} ${unidades} en el lote de las ${when}.${extra}`;
      status.classList.add("is-ok");
    } catch (err) {
      status.textContent = errorText(err);
      status.classList.add("is-error");
    } finally {
      loteEnviando = false;
    }
  });

  window.addEventListener("beforeunload", (ev) => {
    if (!loteEnviando && !loteDirty()) return;
    ev.preventDefault();
    ev.returnValue = "";
  });
  const navBack = document.querySelector(".nav-back");
  if (navBack) {
    navBack.addEventListener("click", (ev) => {
      if (loteEnviando) {
        ev.preventDefault();
        return;
      }
      if (!loteDirty()) return;
      if (!confirm("¿Descartar este lote?")) ev.preventDefault();
    });
  }

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

  let fotoPreviewUrl = null;

  function clearFotoPreview() {
    if (fotoPreviewUrl) {
      URL.revokeObjectURL(fotoPreviewUrl);
      fotoPreviewUrl = null;
    }
    const img = qs("producto-foto-img");
    img.removeAttribute("src");
    qs("producto-foto-preview").hidden = true;
    qs("producto-foto").value = "";
    qs("producto-foto-label").textContent = "Foto";
  }

  qs("producto-foto").addEventListener("change", () => {
    const file = qs("producto-foto").files[0];
    if (!file || !String(file.type || "").startsWith("image/")) {
      clearFotoPreview();
      if (file) {
        pStatus.textContent = "Esa no es una imagen. Usa jpg o png.";
        pStatus.classList.add("is-error");
      }
      return;
    }
    if (fotoPreviewUrl) URL.revokeObjectURL(fotoPreviewUrl);
    fotoPreviewUrl = URL.createObjectURL(file);
    qs("producto-foto-img").src = fotoPreviewUrl;
    qs("producto-foto-preview").hidden = false;
    qs("producto-foto-label").textContent = "Cambiar";
    pStatus.textContent = "";
    pStatus.classList.remove("is-error", "is-ok");
  });

  qs("producto-foto-quitar").addEventListener("click", () => {
    clearFotoPreview();
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
      clearFotoPreview();
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
    if (modo === "lote") {
      for (const it of items) {
        addLinea({
          categoria: it.categoria,
          nombre: ETIQUETA[it.categoria] || it.categoria,
          cantidad: it.cantidad,
        });
      }
      draft.items = [];
      draft.textos = [];
      revision.hidden = true;
      dictado.value = "";
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
