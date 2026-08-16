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

function yoIcon() {
  return L.divIcon({
    className: "yo-wrap",
    html: '<span class="yo-dot"><span class="yo-pulse"></span></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function locate(map, layers, status) {
  if (!navigator.geolocation) {
    if (status) {
      status.textContent = "Este celular no da GPS.";
      status.classList.add("is-error");
    }
    return;
  }
  if (status) {
    status.textContent = "Buscando tu ubicación…";
    status.classList.remove("is-error");
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const latlng = [pos.coords.latitude, pos.coords.longitude];
      const acc = Number.isFinite(pos.coords.accuracy)
        ? Math.max(20, pos.coords.accuracy)
        : 40;
      map.setView(latlng, 16);
      if (layers.marker) {
        layers.marker.setLatLng(latlng);
      } else {
        layers.marker = L.marker(latlng, {
          icon: yoIcon(),
          zIndexOffset: 800,
          keyboard: false,
          title: "Estás aquí",
        }).addTo(map);
        layers.marker.bindPopup("Estás aquí");
      }
      if (layers.circle) {
        layers.circle.setLatLng(latlng);
        layers.circle.setRadius(acc);
      } else {
        layers.circle = L.circle(latlng, {
          radius: acc,
          className: "yo-accuracy",
          interactive: false,
          stroke: true,
          fill: true,
        }).addTo(map);
      }
      layers.marker.openPopup();
      if (status) {
        status.textContent = "Estás aquí. Pin naranja = hay insumos.";
      }
    },
    (err) => {
      if (!status) return;
      status.classList.add("is-error");
      if (err && err.code === 1) {
        status.textContent =
          "Activa el permiso de ubicación en el navegador y vuelve a tocar Mi ubicación.";
        return;
      }
      status.textContent = "No se pudo leer el GPS. Intenta de nuevo.";
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
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

  const me = { marker: null, circle: null };
  document.getElementById("btn-ubicacion")?.addEventListener("click", () => {
    locate(map, me, status);
  });

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
