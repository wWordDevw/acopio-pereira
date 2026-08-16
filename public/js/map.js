import { listPuntos } from "./api.js";
import { PEREIRA, stockResumen, errorText } from "./categorias.js";

function pinIcon(lleno) {
  return L.divIcon({
    className: "pin-wrap",
    html: `<span class="pin${lleno ? " is-full" : ""}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [6, 20],
    popupAnchor: [5, -18],
  });
}

function locate(map) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 15);
    },
    () => {},
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 },
  );
}

async function main() {
  const el = document.getElementById("map");
  const status = document.getElementById("status");
  if (!el || typeof L === "undefined") return;

  const map = L.map(el, { zoomControl: true }).setView(
    [PEREIRA.lat, PEREIRA.lng],
    13,
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  document.getElementById("btn-ubicacion")?.addEventListener("click", () => {
    locate(map);
  });
  locate(map);

  try {
    const data = await listPuntos();
    const puntos = data.puntos || [];
    if (puntos.length === 0 && status) {
      status.textContent = "Aún no hay puntos. Crea el primero.";
    }
    for (const p of puntos) {
      const marker = L.marker([p.lat, p.lng], {
        icon: pinIcon(p.tiene_stock),
        title: p.nombre,
      }).addTo(map);
      const href = `/punto.html?id=${encodeURIComponent(p.id)}`;
      const popup = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = p.nombre;
      const line = document.createElement("p");
      line.textContent = stockResumen(p.inventario);
      const link = document.createElement("a");
      link.href = href;
      link.textContent = "Abrir punto";
      popup.append(name, line, link);
      marker.bindPopup(popup);
      marker.on("click", () => {
        /* popup handles navigation */
      });
    }
  } catch (err) {
    if (status) {
      status.textContent = errorText(err);
      status.classList.add("is-error");
    }
  }
}

main();
