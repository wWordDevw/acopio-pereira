// Protocolo Cabuya v0.1 — manifiesto (L1) y feed de places (L2).
// Spec: https://cabuya.org/spec · esquema place-feed 0.1.
//
// El feed es una proyección de solo lectura de `puntos`. No inventa datos:
// cada campo sale de una columna o de la nota estructurada que escribe la PWA.

export const SPEC_VERSION = "0.1.0";
export const PUBLISHER_ID = "insumos-pereira";
export const LICENSE = "CC0-1.0";
export const PERMITTED_USE = ["display", "aggregate", "redistribute", "ai_answer"];
export const FEED_TTL = 300;

// La PWA escribe la nota como  «{tipo} · {estado} · {precisión} · {zona} · …».
// El tipo es lo único obligatorio: sin un tipo reconocido no sabemos qué es el
// punto, y §7.5 trata los lugares inventados como causal de suspensión. Los
// registros de prueba que quedaron en producción no traen nota estructurada y
// caen por esta puerta.
const PLACE_KIND = {
  acopio: "collection_center",
  albergue: "shelter",
};

const SERVICE_STATUS = {
  activo: "open",
  abierto: "open",
  lleno: "full",
};

const GEO_PRECISION = {
  gps: "exact",
  "pin aproximado": "approximate",
};

// DIVIPOLA. La zona es un barrio de Pereira salvo cuando dice Dosquebradas,
// que es municipio propio.
const DOSQUEBRADAS = { code: "66170", text: "Dosquebradas" };
const PEREIRA = { code: "66001", text: "Pereira" };

function partesDeNota(nota) {
  return String(nota || "")
    .split("·")
    .map((p) => p.trim())
    .filter(Boolean);
}

// SQLite guarda «2026-08-16 19:00:09» en UTC; RFC 3339 lo quiere con T y Z.
export function rfc3339(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  if (texto.endsWith("Z")) return texto;
  return `${texto.replace(" ", "T")}Z`;
}

function municipioDe(zona) {
  return zona && zona.toLowerCase() === "dosquebradas" ? DOSQUEBRADAS : PEREIRA;
}

function nombreSinTipo(nombre, tipoCrudo) {
  // CR-2: el nombre no lleva estado operativo. El tipo tampoco hace falta ahí
  // porque viaja en place_kind.
  const prefijo = `${tipoCrudo} ·`;
  return nombre.startsWith(prefijo)
    ? nombre.slice(prefijo.length).trim() || nombre
    : nombre;
}

/**
 * Traduce una fila de `puntos` a un registro `place` del esquema 0.1.
 * Devuelve null si el punto no es publicable (sin tipo reconocido).
 */
export function toPlace(row, { baseUrl }) {
  const partes = partesDeNota(row.nota);
  const tipoCrudo = partes[0] || "";
  const placeKind = PLACE_KIND[tipoCrudo.toLowerCase()];
  if (!placeKind) return null;

  const zona = partes[3] && partes[3] !== "Otra zona" ? partes[3] : null;
  const municipio = municipioDe(partes[3]);
  const servicio = SERVICE_STATUS[(partes[1] || "").toLowerCase()];
  const precision = GEO_PRECISION[(partes[2] || "").toLowerCase()];
  const publicUrl = `${baseUrl}/punto.html?id=${encodeURIComponent(row.id)}`;

  return {
    id: row.id,
    publisher_id: PUBLISHER_ID,
    name: nombreSinTipo(row.nombre, tipoCrudo),
    place_kind: placeKind,
    origin_category: tipoCrudo, // verbatim: deja el crosswalk auditable
    municipality_code: municipio.code,
    municipality_text: municipio.text,
    ...(zona ? { neighborhood_text: zona } : {}),
    lat: row.lat,
    lon: row.lng,
    ...(precision ? { geo_precision: precision } : {}),
    lifecycle_status: "active",
    ...(servicio ? { service_status: servicio } : {}),
    // CR-1: editar no es confirmar. Solo un movimiento de inventario prueba
    // que alguien estuvo en el punto; sin movimientos, null es el dato honesto.
    last_confirmed_at: rfc3339(row.ultimo_movimiento),
    ...(row.ultimo_movimiento ? { confirmation_method: "user_report" } : {}),
    updated_at: rfc3339(row.updated_at),
    published_at: rfc3339(row.created_at),
    source: {
      source_id: PUBLISHER_ID,
      source_kind: "first_party",
      source_url: publicUrl,
    },
    source_authority: "community",
    public_url: publicUrl,
    contact_available: false, // §7.2: el valor de contacto nunca viaja
  };
}

const SQL_PUNTOS = `
  select p.id, p.nombre, p.nota, p.lat, p.lng, p.created_at, p.updated_at,
         (select max(m.created_at) from movimientos m where m.punto_id = p.id)
           as ultimo_movimiento
    from puntos p
   order by p.updated_at desc
`;

/**
 * Arma el feed completo. `last_updated` sale del dato más reciente publicado,
 * nunca de la hora de la petición (§3.1 lo llama anti-patrón «always-now»).
 */
export function buildPlaceFeed(db, { baseUrl }) {
  const places = db
    .prepare(SQL_PUNTOS)
    .all()
    .map((row) => toPlace(row, { baseUrl }))
    .filter(Boolean);

  const sellos = places
    .flatMap((p) => [p.updated_at, p.last_confirmed_at])
    .filter(Boolean)
    .sort();
  const lastUpdated = sellos.length ? sellos[sellos.length - 1] : rfc3339(null);

  return {
    last_updated: lastUpdated || "1970-01-01T00:00:00Z",
    ttl: FEED_TTL,
    version: SPEC_VERSION,
    publisher_id: PUBLISHER_ID,
    license: LICENSE,
    permitted_use: PERMITTED_USE,
    data: { places },
  };
}
