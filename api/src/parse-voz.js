import { CATEGORIAS } from "./categorias.js";

const KEYWORDS = {
  agua: [
    "agua",
    "aguas",
    "botella",
    "botellas",
    "litro",
    "litros",
    "hidrat",
  ],
  comida: [
    "comida",
    "comidas",
    "alimento",
    "alimentos",
    "atun",
    "arroz",
    "frijol",
    "frijoles",
    "enlatad",
    "mercado",
    "mercados",
    "galleta",
    "galletas",
    "aceite",
    "enlatado",
    "enlatados",
    "atún",
  ],
  medicinas: [
    "medicina",
    "medicinas",
    "medicamento",
    "medicamentos",
    "suero",
    "sueros",
    "pastilla",
    "pastillas",
    "acetaminofen",
    "ibuprofeno",
    "farmacia",
    "vendaje",
    "vendajes",
    "curita",
    "curitas",
  ],
  cobijas: [
    "cobija",
    "cobijas",
    "frazada",
    "frazadas",
    "manta",
    "mantas",
    "sabana",
    "sabanas",
    "sábana",
    "sábanas",
  ],
  ropa: [
    "ropa",
    "camisa",
    "camisas",
    "pantalon",
    "pantalones",
    "pantalón",
    "zapato",
    "zapatos",
    "tenis",
    "chompa",
    "chompas",
    "chaqueta",
    "chaquetas",
  ],
  higiene: [
    "higiene",
    "aseo",
    "jabon",
    "jabón",
    "jabones",
    "pasta",
    "cepillo",
    "cepillos",
    "toalla",
    "toallas",
    "kit",
    "kits",
    "shampoo",
    "papel",
    "toallitas",
  ],
  ninos: [
    "nino",
    "ninos",
    "niño",
    "niños",
    "panal",
    "panales",
    "pañal",
    "pañales",
    "bebe",
    "bebes",
    "bebé",
    "bebés",
    "formula",
    "fórmula",
    "leche",
  ],
  mascotas: [
    "mascota",
    "mascotas",
    "perro",
    "perros",
    "gato",
    "gatos",
    "croqueta",
    "croquetas",
  ],
};

const NUMEROS = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  dieciséis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
};

function fold(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function parseCantidad(chunk) {
  const digit = chunk.match(/\b(\d{1,3})\b/);
  if (digit) {
    const n = Number(digit[1]);
    if (n >= 1 && n <= 999) return n;
  }
  const tokens = fold(chunk).split(/[^a-z0-9áéíóúüñ]+/i).filter(Boolean);
  for (const t of tokens) {
    if (NUMEROS[t]) return NUMEROS[t];
  }
  return 1;
}

function parseCategoria(chunk) {
  const f = fold(chunk);
  for (const cat of CATEGORIAS) {
    if (cat === "otro") continue;
    for (const word of KEYWORDS[cat]) {
      const w = fold(word);
      if (f.includes(w)) return cat;
    }
  }
  return "otro";
}

function parseChunk(chunk) {
  const trimmed = chunk.trim();
  if (!trimmed) return null;
  return {
    categoria: parseCategoria(trimmed),
    cantidad: parseCantidad(trimmed),
  };
}

export function parseVoz(texto) {
  const raw = String(texto || "").trim();
  if (!raw) return [];
  const chunks = raw
    .split(/\s+y\s+|[,;]+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const items = [];
  for (const chunk of chunks) {
    const item = parseChunk(chunk);
    if (item) items.push({ ...item, texto_original: raw });
  }
  return items;
}
