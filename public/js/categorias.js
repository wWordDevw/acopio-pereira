export const CATEGORIAS = [
  ["comida", "Comida"],
  ["medicinas", "Medicinas"],
  ["higiene", "Higiene"],
  ["ninos", "Niños"],
  ["cobijas", "Cobijas"],
  ["agua", "Agua"],
  ["ropa", "Ropa"],
  ["mascotas", "Mascotas"],
  ["otro", "Otro"],
];

export const ETIQUETA = Object.fromEntries(CATEGORIAS);

export const CAT_MARK = {
  comida: "Co",
  medicinas: "Md",
  higiene: "Hg",
  ninos: "Ni",
  cobijas: "Cb",
  agua: "Ag",
  ropa: "Rp",
  mascotas: "Ms",
  otro: "Ot",
};

export const PEREIRA = { lat: 4.8133, lng: -75.6961 };

export function newKey() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function stockResumen(inventario) {
  if (!inventario || inventario.length === 0) return "Recibe insumos";
  return inventario
    .map((i) => `${i.etiqueta || ETIQUETA[i.categoria] || i.categoria} ${i.stock}`)
    .join(" · ");
}

export function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return d.toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function errorText(err) {
  const code = err && (err.code || err.message);
  const map = {
    fuera_de_zona: "Ese punto queda fuera del área de Pereira.",
    nombre_invalido: "Pon un nombre de 2 a 80 letras.",
    nota_invalida: "La nota es muy larga.",
    url_no_permitida: "No se permiten enlaces.",
    categoria_invalida: "Categoría no válida.",
    cantidad_invalida: "Cantidad entre 1 y 999.",
    tipo_invalido: "Elige entra o sale.",
    sin_stock: "Ahí no hay de eso para entregar.",
    rate_limit: "Demasiados registros. Espera un momento.",
    texto_invalido: "No entendí el dictado. Prueba otra vez o usa los botones.",
    coordenada_invalida: "Falta la ubicación.",
    no_encontrado: "No encontramos ese punto.",
    error_red: "Sin red. Intenta de nuevo.",
    error_interno: "Falló el servidor. Intenta de nuevo.",
    posible_duplicado: "Ese producto ya existe o se parece a uno. Elige el de la lista.",
    foto_invalida: "La foto no se pudo leer. Usa jpg o png.",
    foto_grande: "La foto es muy pesada. Prueba otra más liviana.",
    producto_invalido: "Producto no válido.",
  };
  return map[code] || "No se pudo guardar. Intenta de nuevo.";
}
