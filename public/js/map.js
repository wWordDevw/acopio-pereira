import { listPuntos } from "./api.js";
import { PEREIRA, errorText } from "./categorias.js";

function pinIcon(lleno) {
  return L.divIcon({
    className: `pin-wrap${lleno ? " is-full" : ""}`,
    html: `<span class="pin${lleno ? " is-full" : ""}"></span>`,
    iconSize: [36, 48],
    iconAnchor: [18, 46],
    popupAnchor: [0, -40],
    tooltipAnchor: [0, -42],
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

const GEO_OPTS = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 8000,
};

function fitVista(map, layers) {
  const pts = (layers.puntos || []).map((p) => [p.lat, p.lng]);
  if (layers.last) {
    pts.push([layers.last.coords.latitude, layers.last.coords.longitude]);
  }
  if (pts.length === 0) return;
  if (pts.length === 1) {
    map.setView(pts[0], 15);
    return;
  }
  map.fitBounds(pts, { padding: [56, 56], maxZoom: 15 });
}

function paintMe(map, layers, pos, { center, openPopup }) {
  const latlng = [pos.coords.latitude, pos.coords.longitude];
  const acc = Number.isFinite(pos.coords.accuracy)
    ? Math.max(20, Math.min(pos.coords.accuracy, 80))
    : 40;
  layers.last = pos;
  if (center) {
    if (!openPopup && layers.puntos && layers.puntos.length > 0) {
      fitVista(map, layers);
    } else {
      map.setView(latlng, 16);
    }
  }
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
  if (openPopup) layers.marker.openPopup();
}

function startWatch(map, layers, status, { recenter } = {}) {
  if (!navigator.geolocation) {
    if (status) {
      status.textContent = "Este celular no da GPS.";
      status.classList.add("is-error");
    }
    return;
  }

  layers.wantCenter = Boolean(recenter) || layers.wantCenter;
  if (recenter && layers.last) {
    paintMe(map, layers, layers.last, { center: true, openPopup: true });
  }

  if (layers.watchId != null) return;

  if (status && !layers.marker) {
    status.textContent = "Buscando tu ubicación…";
    status.classList.remove("is-error");
  }

  layers.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const first = !layers.marker;
      const fromButton = layers.wantCenter && !first;
      const center = first || layers.wantCenter;
      paintMe(map, layers, pos, {
        center,
        openPopup: fromButton,
      });
      layers.wantCenter = false;
      if (status) {
        status.classList.remove("is-error");
        status.textContent = "Estás aquí. Pin naranja = hay insumos.";
      }
    },
    (err) => {
      if (!status) return;
      if (layers.marker) return;
      status.classList.add("is-error");
      if (err && err.code === 1) {
        status.textContent =
          "Permite la ubicación cuando el navegador la pida para verte en el mapa.";
        return;
      }
      status.textContent = "No se pudo leer el GPS. Toca Mi ubicación.";
    },
    GEO_OPTS,
  );
}

function followPermission(map, layers, status) {
  if (!navigator.permissions || !navigator.permissions.query) return;
  navigator.permissions
    .query({ name: "geolocation" })
    .then((perm) => {
      const onChange = () => {
        if (perm.state === "granted") {
          if (layers.watchId != null && navigator.geolocation.clearWatch) {
            navigator.geolocation.clearWatch(layers.watchId);
            layers.watchId = null;
          }
          startWatch(map, layers, status, { recenter: true });
        }
        if (perm.state === "prompt") {
          startWatch(map, layers, status, { recenter: true });
        }
      };
      perm.addEventListener("change", onChange);
      if (perm.state === "granted") {
        startWatch(map, layers, status, { recenter: true });
      }
    })
    .catch(() => {});
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

  const me = {
    marker: null,
    circle: null,
    watchId: null,
    last: null,
    wantCenter: true,
    puntos: [],
  };
  startWatch(map, me, status, { recenter: true });
  followPermission(map, me, status);
  document.getElementById("btn-ubicacion")?.addEventListener("click", () => {
    startWatch(map, me, status, { recenter: true });
  });

  try {
    const data = await listPuntos();
    const puntos = data.puntos || [];
    me.puntos = puntos;
    if (puntos.length === 0 && status && !me.marker) {
      status.textContent = "Aún no hay puntos. Crea el primero.";
    }
    for (const p of puntos) {
      const marker = L.marker([p.lat, p.lng], {
        icon: pinIcon(p.tiene_stock),
        title: p.nombre,
        zIndexOffset: 400,
      }).addTo(map);
      const href = `/punto.html?id=${encodeURIComponent(p.id)}`;
      marker.on("click", () => {
        window.location.assign(href);
      });
      marker.bindTooltip(p.nombre, {
        permanent: true,
        direction: "top",
        offset: [0, -6],
        className: "pin-label",
        opacity: 1,
        interactive: false,
      });
    }
    fitVista(map, me);
  } catch (err) {
    if (status) {
      status.textContent = errorText(err);
      status.classList.add("is-error");
    }
  }
}

main();
