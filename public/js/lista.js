import { listPuntos } from "./api.js";
import { stockResumen, errorText } from "./categorias.js";

function matches(punto, q) {
  if (!q) return true;
  const hay = `${punto.nombre} ${punto.nota || ""}`.toLowerCase();
  return hay.includes(q);
}

function render(list, puntos) {
  list.replaceChildren();
  if (puntos.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No hay puntos con ese nombre.";
    list.append(li);
    return;
  }
  for (const p of puntos) {
    const li = document.createElement("li");
    li.className = "card";
    const a = document.createElement("a");
    a.href = `/punto.html?id=${encodeURIComponent(p.id)}`;
    a.className = "nav-back";
    a.textContent = p.nombre;
    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = stockResumen(p.inventario);
    li.append(a, meta);
    list.append(li);
  }
}

async function main() {
  const list = document.getElementById("lista");
  const search = document.getElementById("q");
  const status = document.getElementById("status");
  let puntos = [];
  try {
    const data = await listPuntos();
    puntos = data.puntos || [];
    render(list, puntos);
    if (puntos.length === 0) {
      status.textContent = "Aún no hay puntos. Crea el primero.";
    }
  } catch (err) {
    status.textContent = errorText(err);
    status.classList.add("is-error");
    return;
  }
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    render(
      list,
      puntos.filter((p) => matches(p, q)),
    );
  });
}

main();
