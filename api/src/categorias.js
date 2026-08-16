export const CATEGORIAS = [
  "agua",
  "comida",
  "medicinas",
  "cobijas",
  "ropa",
  "higiene",
  "ninos",
  "mascotas",
  "otro",
];

export const ETIQUETAS = {
  agua: "Agua",
  comida: "Comida",
  medicinas: "Medicinas",
  cobijas: "Cobijas",
  ropa: "Ropa",
  higiene: "Higiene",
  ninos: "Niños",
  mascotas: "Mascotas",
  otro: "Otro",
};

export const CAJA = {
  latMin: 4.7,
  latMax: 5.05,
  lngMin: -75.9,
  lngMax: -75.5,
};

export const PEREIRA = { lat: 4.8133, lng: -75.6961 };

export function enCaja(lat, lng) {
  return (
    lat >= CAJA.latMin &&
    lat <= CAJA.latMax &&
    lng >= CAJA.lngMin &&
    lng <= CAJA.lngMax
  );
}

function fold(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function categoriaDesdeTexto(raw) {
  const q = fold(raw || "").trim();
  if (!q) return null;
  for (const slug of CATEGORIAS) {
    if (q === slug || q === fold(ETIQUETAS[slug])) return slug;
  }
  if (q === "ninos" || q === "nino" || q === "pañales" || q === "panales") {
    return "ninos";
  }
  return null;
}
