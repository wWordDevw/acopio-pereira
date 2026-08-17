import { CATEGORIAS } from "./categorias.js";

export function foldNombre(raw) {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugNombre(raw) {
  return foldNombre(raw).replace(/\s+/g, "-");
}

/** Semilla desde nec[] de Unidos por Pereira + catálogo de voz. */
export const SEMILLA_PRODUCTOS = [
  { nombre: "Agua potable", categoria: "agua", aliases: ["agua", "aguas", "botellas de agua"] },
  { nombre: "Arroz", categoria: "comida", aliases: ["arroces"] },
  { nombre: "Frijoles", categoria: "comida", aliases: ["frijol", "fríjoles"] },
  { nombre: "Lentejas", categoria: "comida", aliases: ["lenteja"] },
  { nombre: "Garbanzos", categoria: "comida", aliases: ["garbanzo"] },
  { nombre: "Granos", categoria: "comida", aliases: ["grano"] },
  { nombre: "Aceite", categoria: "comida", aliases: ["aceites"] },
  { nombre: "Panela", categoria: "comida", aliases: ["panelas"] },
  { nombre: "Azúcar", categoria: "comida", aliases: ["azucar"] },
  { nombre: "Sal", categoria: "comida", aliases: [] },
  { nombre: "Chocolate", categoria: "comida", aliases: [] },
  { nombre: "Pasta", categoria: "comida", aliases: ["pastas", "fideo", "fideos", "spaghetti"] },
  { nombre: "Enlatados", categoria: "comida", aliases: ["enlatado", "latas", "atun", "atún", "sardinas"] },
  { nombre: "Alimentos no perecederos", categoria: "comida", aliases: ["no perecederos", "mercado", "mercados"] },
  { nombre: "Harina", categoria: "comida", aliases: [] },
  { nombre: "Medicamentos", categoria: "medicinas", aliases: ["medicina", "medicinas", "medicamento"] },
  { nombre: "Insumos médicos", categoria: "medicinas", aliases: ["insumo medico", "insumos medicos", "hospitalario"] },
  { nombre: "Acetaminofén", categoria: "medicinas", aliases: ["acetaminofen"] },
  { nombre: "Insulina", categoria: "medicinas", aliases: [] },
  { nombre: "Salbutamol", categoria: "medicinas", aliases: ["inhalador"] },
  { nombre: "Cobijas", categoria: "cobijas", aliases: ["cobija", "frazada", "frazadas", "manta"] },
  { nombre: "Almohadas", categoria: "cobijas", aliases: ["almohada"] },
  { nombre: "Colchonetas", categoria: "cobijas", aliases: ["colchoneta", "colchon"] },
  { nombre: "Carpas", categoria: "cobijas", aliases: ["carpa"] },
  { nombre: "Sábanas", categoria: "cobijas", aliases: ["sabanas", "sabana"] },
  { nombre: "Ropa para adultos", categoria: "ropa", aliases: ["ropa", "ropa para adulto"] },
  { nombre: "Ropa para hombre", categoria: "ropa", aliases: [] },
  { nombre: "Ropa para mujer", categoria: "ropa", aliases: [] },
  { nombre: "Zapatos", categoria: "ropa", aliases: ["zapato", "tenis"] },
  { nombre: "Kit de aseo", categoria: "higiene", aliases: ["kit de aseo personal", "elementos de aseo personal", "productos de aseo personal"] },
  { nombre: "Toallas", categoria: "higiene", aliases: ["toalla", "toallas de cuerpo", "toallas para cuerpo"] },
  { nombre: "Jabón", categoria: "higiene", aliases: ["jabon", "jabón de lavamanos"] },
  { nombre: "Repelente", categoria: "higiene", aliases: ["repelente para zancudos", "repelentes"] },
  { nombre: "Protectores diarios", categoria: "higiene", aliases: [] },
  { nombre: "Cepillos de dientes", categoria: "higiene", aliases: ["cepillo", "cepillos"] },
  { nombre: "Bolsas de basura", categoria: "higiene", aliases: ["bolsa de basura"] },
  { nombre: "Pañales", categoria: "ninos", aliases: ["panal", "panales", "pañales etapa 3 4 5"] },
  { nombre: "Pañitos", categoria: "ninos", aliases: ["panitos", "toallitas"] },
  { nombre: "Leche para bebés", categoria: "ninos", aliases: ["leche", "leche para bebes", "formula", "fórmula"] },
  { nombre: "Ropa para niños", categoria: "ninos", aliases: ["ropa ninos", "ropa de nino"] },
  { nombre: "Cosas para bebés", categoria: "ninos", aliases: ["todo tipo de cosas para bebes", "cosas de bebe"] },
  { nombre: "Alimento para mascotas", categoria: "mascotas", aliases: ["comida para mascotas", "cuido"] },
  { nombre: "Comida para perros", categoria: "mascotas", aliases: ["alimento para perros", "croquetas"] },
  { nombre: "Comida para gatos", categoria: "mascotas", aliases: ["alimento para gatos"] },
  { nombre: "Medicinas veterinarias", categoria: "mascotas", aliases: ["medicina mascotas", "medicinas para mascotas"] },
];

export function aliasesOf(row) {
  if (!row) return [];
  if (Array.isArray(row.aliases)) return row.aliases;
  try {
    const parsed = JSON.parse(row.aliases || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function productoMatchKeys(row) {
  const keys = new Set([foldNombre(row.nombre), slugNombre(row.nombre)]);
  for (const a of aliasesOf(row)) {
    const f = foldNombre(a);
    if (f) keys.add(f);
  }
  return keys;
}

export function findProductoEnLista(lista, nombre, categoria) {
  const needle = foldNombre(nombre);
  if (!needle) return null;
  const slug = slugNombre(nombre);
  for (const row of lista) {
    if (categoria && row.categoria !== categoria) continue;
    const keys = productoMatchKeys(row);
    if (keys.has(needle) || keys.has(slug) || row.slug === slug) return row;
  }
  return null;
}

export function candidatosParecidos(lista, nombre, categoria) {
  const needle = foldNombre(nombre);
  if (needle.length < 4) return [];
  const out = [];
  for (const row of lista) {
    if (categoria && row.categoria !== categoria) continue;
    for (const key of productoMatchKeys(row)) {
      if (!key) continue;
      if (key === needle) continue;
      if (key.includes(needle) || needle.includes(key)) {
        out.push(row);
        break;
      }
    }
  }
  return out;
}

export function categoriaValida(slug) {
  return CATEGORIAS.includes(slug);
}
