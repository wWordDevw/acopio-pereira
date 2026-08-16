/** @typedef {{ id: string, nombre: string, aliases: string[], lat: number, lng: number, radioKm: number }} Zona */

/** @type {Zona[]} */
export const ZONAS = [
  {
    id: "centro",
    nombre: "Centro",
    aliases: ["centro", "plaza de bolivar", "plaza de bolívar"],
    lat: 4.8133,
    lng: -75.6961,
    radioKm: 2,
  },
  {
    id: "cuba",
    nombre: "Cuba",
    aliases: ["cuba"],
    lat: 4.796,
    lng: -75.715,
    radioKm: 2,
  },
  {
    id: "boston",
    nombre: "Boston",
    aliases: ["boston"],
    lat: 4.808,
    lng: -75.685,
    radioKm: 1.5,
  },
  {
    id: "el-poblado",
    nombre: "El Poblado",
    aliases: ["el poblado", "poblado"],
    lat: 4.82,
    lng: -75.68,
    radioKm: 1.5,
  },
  {
    id: "consota",
    nombre: "Consotá",
    aliases: ["consota", "consotá"],
    lat: 4.79,
    lng: -75.68,
    radioKm: 2,
  },
  {
    id: "circunvalar",
    nombre: "La Circunvalar",
    aliases: ["circunvalar", "la circunvalar"],
    lat: 4.805,
    lng: -75.7,
    radioKm: 1.5,
  },
  {
    id: "dosquebradas",
    nombre: "Dosquebradas",
    aliases: ["dosquebradas", "dos quebradas"],
    lat: 4.834,
    lng: -75.676,
    radioKm: 4,
  },
  {
    id: "la-virginia",
    nombre: "La Virginia",
    aliases: ["la virginia", "virginia"],
    lat: 4.899,
    lng: -75.88,
    radioKm: 4,
  },
  {
    id: "expofuturo",
    nombre: "Expofuturo",
    aliases: ["expofuturo", "expo futuro"],
    lat: 4.804,
    lng: -75.721,
    radioKm: 1.5,
  },
  {
    id: "utp",
    nombre: "Universidad Tecnológica",
    aliases: ["utp", "tecnologica", "tecnológica", "universidad tecnologica"],
    lat: 4.794,
    lng: -75.689,
    radioKm: 1.5,
  },
  {
    id: "alamos",
    nombre: "Álamos",
    aliases: ["alamos", "álamos"],
    lat: 4.82,
    lng: -75.71,
    radioKm: 1.5,
  },
];

/** Fold to lowercase ASCII for matching (NFD + strip marks). */
function fold(s) {
  return s
    .normalize("NFD")
    .toLowerCase()
    .replace(/\p{M}/gu, "");
}

/**
 * Match a zone if any alias appears as a whole word in the folded text.
 * Longest alias wins when multiple match.
 * @param {string} texto
 * @returns {{ id: string, nombre: string, lat: number, lng: number, radioKm: number } | null}
 */
export function matchZona(texto) {
  if (texto == null || typeof texto !== "string") return null;
  const folded = fold(texto);

  /** @type {{ id: string, nombre: string, lat: number, lng: number, radioKm: number, aliasLen: number } | null} */
  let best = null;

  for (const zona of ZONAS) {
    for (const alias of zona.aliases) {
      const a = fold(alias);
      if (!a) continue;
      const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(a)}([^a-z0-9]|$)`);
      if (!re.test(folded)) continue;
      if (!best || a.length > best.aliasLen) {
        best = {
          id: zona.id,
          nombre: zona.nombre,
          lat: zona.lat,
          lng: zona.lng,
          radioKm: zona.radioKm,
          aliasLen: a.length,
        };
      }
    }
  }

  if (!best) return null;
  const { id, nombre, lat, lng, radioKm } = best;
  return { id, nombre, lat, lng, radioKm };
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
