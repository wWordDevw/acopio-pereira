import { createPunto } from "./api.js";
import { PEREIRA, newKey, errorText } from "./categorias.js";

let chosen = { lat: PEREIRA.lat, lng: PEREIRA.lng, source: "default" };

function setCoords(lat, lng, source, map, marker, status) {
  chosen = { lat, lng, source };
  marker.setLatLng([lat, lng]);
  map.setView([lat, lng], Math.max(map.getZoom(), 16));
  if (status) {
    status.textContent = `Ubicación: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    status.classList.remove("is-error");
  }
}

function requestGps(map, marker, status) {
  if (!navigator.geolocation) {
    if (status) {
      status.textContent = "Este celular no da GPS. Toca el mapa.";
    }
    return;
  }
  if (status) status.textContent = "Buscando ubicación precisa…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setCoords(
        pos.coords.latitude,
        pos.coords.longitude,
        "gps",
        map,
        marker,
        status,
      );
    },
    () => {
      if (status) {
        status.textContent =
          "No se pudo usar el GPS. Toca el mapa para marcar el punto.";
      }
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
  );
}

function main() {
  const mapEl = document.getElementById("mini-map");
  const form = document.getElementById("form");
  const status = document.getElementById("status");
  if (!mapEl || !form || typeof L === "undefined") return;

  const map = L.map(mapEl, { zoomControl: true }).setView(
    [PEREIRA.lat, PEREIRA.lng],
    14,
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  const marker = L.marker([PEREIRA.lat, PEREIRA.lng], { draggable: true }).addTo(
    map,
  );
  marker.on("dragend", () => {
    const ll = marker.getLatLng();
    setCoords(ll.lat, ll.lng, "drag", map, marker, status);
  });
  map.on("click", (ev) => {
    setCoords(ev.latlng.lat, ev.latlng.lng, "tap", map, marker, status);
  });

  document.getElementById("btn-gps")?.addEventListener("click", () => {
    requestGps(map, marker, status);
  });
  requestGps(map, marker, status);

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const nombre = document.getElementById("nombre").value;
    const nota = document.getElementById("nota").value;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    status.textContent = "Guardando…";
    status.classList.remove("is-error", "is-ok");
    try {
      const punto = await createPunto({
        nombre,
        nota,
        lat: chosen.lat,
        lng: chosen.lng,
        idempotency_key: newKey(),
      });
      window.location.href = `/punto.html?id=${encodeURIComponent(punto.id)}`;
    } catch (err) {
      status.textContent = errorText(err);
      status.classList.add("is-error");
      btn.disabled = false;
    }
  });
}

main();
