import { CATEGORIAS, ETIQUETAS } from "./categorias.js";

const KEYWORDS = {
  agua: [
    "agua",
    "aguas",
    "botella",
    "botellas",
    "botellin",
    "litro",
    "litros",
    "hidrat",
    "bolsa de agua",
    "agua potable",
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
    "lata",
    "latas",
    "sardina",
    "sardinas",
    "lenteja",
    "lentejas",
    "fideo",
    "fideos",
    "harina",
    "azucar",
    "sal",
    "grano",
    "granos",
    "panela",
    "panelas",
    "no perecedero",
    "no perecederos",
    "garbanzo",
    "garbanzos",
    "chocolate",
    "olla",
    "ollas",
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
    "alcohol",
    "tapaboca",
    "tapabocas",
    "insumo medico",
    "insumos medicos",
    "insumo hospitalario",
    "hospitalario",
    "inhalador",
    "inhaladores",
    "insulina",
    "salbutamol",
    "gasa",
    "gasas",
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
    "colchon",
    "colchones",
    "colchoneta",
    "colchonetas",
    "almohada",
    "almohadas",
    "carpa",
    "carpas",
  ],
  ropa: [
    "ropa",
    "camisa",
    "camisas",
    "pantalon",
    "pantalones",
    "zapato",
    "zapatos",
    "tenis",
    "chompa",
    "chompas",
    "chaqueta",
    "chaquetas",
    "interior",
  ],
  higiene: [
    "higiene",
    "aseo",
    "jabon",
    "jabones",
    "cepillo",
    "cepillos",
    "toalla",
    "toallas",
    "kit",
    "kits",
    "shampoo",
    "papel",
    "toallitas",
    "pasta dental",
    "crema dental",
    "gel",
    "repelente",
    "repelentes",
    "ducha",
    "duchas",
    "lavamanos",
    "desodorante",
    "desodorantes",
    "bolsa de basura",
    "bolsas de basura",
  ],
  ninos: [
    "nino",
    "ninos",
    "panal",
    "panales",
    "bebe",
    "bebes",
    "formula",
    "leche",
    "compota",
    "compotas",
    "tetero",
    "teteros",
    "cosas para bebe",
    "cosas de bebe",
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
    "cuido",
    "alimento para mascota",
    "alimento para mascotas",
    "comida para perro",
    "comida para perros",
    "comida para gato",
    "comida para gatos",
    "para mascota",
    "para mascotas",
    "para perro",
    "para perros",
    "para gato",
    "para gatos",
  ],
};

const ONES = {
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
};

const TENS = {
  veinte: 20,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};

const COMPOUND = {
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veintiun: 21,
  veintiuno: 21,
  veintiuna: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
};

const SKIP = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "unos",
  "unas",
  "y",
  "e",
  "tambien",
  "despues",
  "paquete",
  "paquetes",
  "caja",
  "cajas",
  "bulto",
  "bultos",
  "unidad",
  "unidades",
  "llegaron",
  "llego",
  "tenemos",
  "hay",
  "recibimos",
]);

function fold(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function numberAt(tokens, i) {
  const t = tokens[i];
  if (!t) return null;
  if (/^\d{1,3}$/.test(t)) {
    const n = Number(t);
    if (n >= 1 && n <= 999) return { value: n, next: i + 1 };
    return null;
  }
  if (COMPOUND[t]) return { value: COMPOUND[t], next: i + 1 };
  if (ONES[t]) return { value: ONES[t], next: i + 1 };
  if (TENS[t]) {
    if (tokens[i + 1] === "y" && ONES[tokens[i + 2]]) {
      return { value: TENS[t] + ONES[tokens[i + 2]], next: i + 3 };
    }
    return { value: TENS[t], next: i + 1 };
  }
  if (t === "cien" || t === "ciento") return { value: 100, next: i + 1 };
  return null;
}

export function parseCategoria(chunk) {
  const f = fold(chunk);
  let best = "otro";
  let bestLen = 0;
  for (const cat of CATEGORIAS) {
    if (cat === "otro") continue;
    for (const word of KEYWORDS[cat]) {
      const w = fold(word);
      if (w.length > bestLen && f.includes(w)) {
        best = cat;
        bestLen = w.length;
      }
    }
  }
  return best;
}

function publicItem(item, raw) {
  return {
    categoria: item.categoria,
    etiqueta: ETIQUETAS[item.categoria] || item.categoria,
    cantidad: item.cantidad,
    frase: item.frase,
    texto_original: raw,
  };
}

export function parseVoz(texto) {
  const raw = String(texto || "").trim();
  if (!raw) return [];
  const tokens = fold(raw)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const items = [];
  let i = 0;
  while (i < tokens.length) {
    const num = numberAt(tokens, i);
    if (num) {
      i = num.next;
      const words = [];
      while (i < tokens.length && !numberAt(tokens, i)) {
        words.push(tokens[i]);
        i += 1;
      }
      const frase =
        words.filter((w) => !SKIP.has(w)).join(" ") || words.join(" ") || "insumo";
      items.push(
        publicItem(
          {
            categoria: parseCategoria(words.join(" ")),
            cantidad: num.value,
            frase,
          },
          raw,
        ),
      );
      continue;
    }
    const words = [];
    while (i < tokens.length && !numberAt(tokens, i)) {
      words.push(tokens[i]);
      i += 1;
    }
    const meaningful = words.filter((w) => !SKIP.has(w));
    if (meaningful.length === 0) continue;
    const cat = parseCategoria(meaningful.join(" "));
    if (cat === "otro" && items.length > 0) continue;
    items.push(
      publicItem(
        {
          categoria: cat,
          cantidad: 1,
          frase: meaningful.join(" "),
        },
        raw,
      ),
    );
  }
  return items;
}
