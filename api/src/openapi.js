import { CATEGORIAS, ETIQUETAS, CAJA, PEREIRA } from "./categorias.js";

const categoriaEnum = [...CATEGORIAS];

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "string",
      description:
        "Código estable para que el cliente lo traduzca. No es un mensaje para el usuario final.",
      examples: [
        "fuera_de_zona",
        "categoria_invalida",
        "sin_stock",
        "rate_limit",
        "no_encontrado",
      ],
    },
  },
};

const itemInventario = {
  type: "object",
  required: ["categoria", "etiqueta", "stock"],
  properties: {
    categoria: { type: "string", enum: categoriaEnum },
    etiqueta: {
      type: "string",
      description: "Nombre para mostrar en español.",
      example: "Cobijas",
    },
    stock: {
      type: "integer",
      minimum: 1,
      description: "Unidades actuales (entradas − salidas). Solo se listan > 0.",
    },
  },
};

const puntoResumen = {
  type: "object",
  required: [
    "id",
    "nombre",
    "nota",
    "lat",
    "lng",
    "created_at",
    "updated_at",
    "inventario",
    "tiene_stock",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    nombre: { type: "string", example: "Iglesia de Cuba" },
    nota: { type: "string", nullable: true, example: "Entran por el costado sur" },
    lat: { type: "number", format: "double", example: PEREIRA.lat },
    lng: { type: "number", format: "double", example: PEREIRA.lng },
    created_at: {
      type: "string",
      description: "UTC en formato SQLite `YYYY-MM-DD HH:MM:SS`.",
      example: "2026-08-16 16:28:57",
    },
    updated_at: { type: "string", example: "2026-08-16 16:29:07" },
    inventario: { type: "array", items: itemInventario },
    tiene_stock: {
      type: "boolean",
      description: "true si alguna categoría tiene stock > 0.",
    },
    distancia_km: {
      type: "number",
      description:
        "Solo si la consulta envió `lat` y `lng`. Distancia en km al punto, 1 decimal.",
      example: 1.2,
    },
  },
};

const movimiento = {
  type: "object",
  required: [
    "id",
    "tipo",
    "categoria",
    "etiqueta",
    "cantidad",
    "texto_original",
    "created_at",
    "ajustado",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    tipo: { type: "string", enum: ["entra", "sale"] },
    categoria: { type: "string", enum: categoriaEnum },
    etiqueta: { type: "string", example: "Cobijas" },
    cantidad: { type: "integer", minimum: 1, maximum: 999 },
    texto_original: {
      type: "string",
      nullable: true,
      description: "Dictado original si el movimiento nació de voz.",
      example: "20 cobijas y 10 kits de aseo",
    },
    created_at: { type: "string" },
    ajustado: {
      type: "boolean",
      description:
        "true si una salida pidió más de lo disponible y se recortó al stock.",
    },
  },
};

const consultaParams = [
  {
    name: "q",
    in: "query",
    required: false,
    description:
      "Texto libre (máx. 80). Busca en nombre y nota del punto. Si `q` es exactamente una categoría (`agua`, `Cobijas`, `pañales`…), se trata como `categoria` y no como nombre.",
    schema: { type: "string", maxLength: 80 },
    examples: {
      nombre: { value: "Cuba", summary: "Puntos cuyo nombre contiene Cuba" },
      insumo: { value: "cobijas", summary: "Puntos que tienen cobijas" },
    },
  },
  {
    name: "categoria",
    in: "query",
    required: false,
    description: "Solo puntos con stock > 0 en esa categoría.",
    schema: { type: "string", enum: categoriaEnum },
  },
  {
    name: "con_stock",
    in: "query",
    required: false,
    description:
      "Si es `1`, `true` o `si`, solo puntos con algún insumo. Se activa solo si filtras por categoría.",
    schema: { type: "string", enum: ["1", "true", "si"] },
  },
  {
    name: "lat",
    in: "query",
    required: false,
    description: `Latitud del consultante. Va siempre con \`lng\`. Caja de Pereira: ${CAJA.latMin}–${CAJA.latMax}.`,
    schema: { type: "number", example: PEREIRA.lat },
  },
  {
    name: "lng",
    in: "query",
    required: false,
    description: `Longitud del consultante. Va siempre con \`lat\`. Caja: ${CAJA.lngMin}–${CAJA.lngMax}.`,
    schema: { type: "number", example: PEREIRA.lng },
  },
  {
    name: "radio",
    in: "query",
    required: false,
    description: "Radio en km (0.1–50). Default 5. Solo aplica si hay `lat` y `lng`.",
    schema: { type: "number", minimum: 0.1, maximum: 50, default: 5 },
  },
  {
    name: "limit",
    in: "query",
    required: false,
    description: "Máximo de puntos (1–200). Default 200.",
    schema: { type: "integer", minimum: 1, maximum: 200, default: 200 },
  },
];

export function buildOpenApi({ serverUrl }) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Acopio Pereira API",
      version: "1.0.0",
      summary: "Inventario público de insumos de ayuda en Pereira (Colombia).",
      description: [
        "API HTTP JSON, **sin autenticación**.",
        "",
        "## Para qué sirve",
        "Consultar **dónde hay insumos** (agua, comida, cobijas…) y **cuánto queda** en cada punto de acopio.",
        "También se puede **crear un punto** y **registrar entradas/salidas** (bots, planillas, otras apps).",
        "",
        "## Base URL",
        "Mismo host que la PWA. Todas las rutas empiezan por `/api`.",
        "",
        "## Convenciones",
        "- JSON UTF-8. Fechas UTC `YYYY-MM-DD HH:MM:SS`.",
        "- Errores: `{ \"error\": \"codigo_estable\" }` con 400 / 404 / 429 / 500.",
        "- Escrituras (`POST`) llevan `idempotency_key` (UUID v4). El mismo key no duplica: responde 200 con el recurso existente.",
        "- El stock **no se guarda aparte**: es `SUM(entra) − SUM(sale)` por punto y categoría.",
        "- CORS abierto en **GET** (`Access-Control-Allow-Origin: *`). Los `POST` están pensados para el mismo origen o clientes server-side.",
        "",
        "## Zona geográfica",
        `Solo Pereira / Dosquebradas / La Virginia. Caja: lat ${CAJA.latMin}–${CAJA.latMax}, lng ${CAJA.lngMin}–${CAJA.lngMax}. Fuera de ahí: \`fuera_de_zona\`.`,
        "",
        "## Categorías",
        Object.entries(ETIQUETAS)
          .map(([slug, label]) => `- \`${slug}\` — ${label}`)
          .join("\n"),
        "",
        "## Rate limit (escrituras)",
        "- Crear puntos: 30 POST / hora / IP.",
        "- Movimientos: 60 POST / minuto / IP.",
        "- Respuesta: `429 { \"error\": \"rate_limit\" }`.",
        "",
        "## Ejemplo rápido",
        "```",
        "curl 'https://HOST/api/consultar?q=cobijas'",
        "curl 'https://HOST/api/puntos?lat=4.8133&lng=-75.6961&radio=3'",
        "```",
      ].join("\n"),
      contact: {
        name: "Acopio Pereira",
        url: serverUrl || "/",
      },
      license: { name: "Uso humanitario — datos públicos" },
    },
    servers: [
      {
        url: serverUrl || "/",
        description: "Este servidor",
      },
    ],
    tags: [
      {
        name: "Consulta",
        description:
          "Lectura pública. Úsalos desde un bot, un mapa o una planilla. No requieren key.",
      },
      {
        name: "Escritura",
        description:
          "Crear puntos y mover inventario. Sin login. Lleva `idempotency_key`.",
      },
      { name: "Meta", description: "Salud, catálogo y esta documentación." },
    ],
    paths: {
      "/api/salud": {
        get: {
          tags: ["Meta"],
          summary: "Healthcheck",
          operationId: "getSalud",
          description: "Para balanceadores y monitoreo. Alias: `GET /api/health`.",
          responses: {
            200: {
              description: "Servicio arriba.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { ok: { type: "boolean", example: true } },
                  },
                  example: { ok: true },
                },
              },
            },
          },
        },
      },
      "/api/health": {
        get: {
          tags: ["Meta"],
          summary: "Healthcheck (alias en inglés)",
          operationId: "getHealth",
          responses: {
            200: {
              description: "Servicio arriba.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { ok: { type: "boolean" } },
                  },
                },
              },
            },
          },
        },
      },
      "/api": {
        get: {
          tags: ["Meta"],
          summary: "Catálogo corto de la API",
          operationId: "getCatalogo",
          description: "Lista las rutas. La documentación interactiva está en `/api/docs`.",
          responses: {
            200: { description: "Índice de endpoints." },
          },
        },
      },
      "/api/openapi.json": {
        get: {
          tags: ["Meta"],
          summary: "Especificación OpenAPI 3.0",
          operationId: "getOpenApi",
          responses: {
            200: { description: "Documento OpenAPI (JSON)." },
          },
        },
      },
      "/api/docs": {
        get: {
          tags: ["Meta"],
          summary: "Swagger UI",
          operationId: "getSwaggerUi",
          description: "Interfaz para explorar y probar la API.",
          responses: {
            200: { description: "HTML de Swagger UI." },
          },
        },
      },
      "/api/categorias": {
        get: {
          tags: ["Consulta"],
          summary: "Listar categorías de insumos",
          operationId: "getCategorias",
          responses: {
            200: {
              description: "Catálogo fijo de categorías.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      categorias: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            slug: { type: "string", enum: categoriaEnum },
                            etiqueta: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                  example: {
                    categorias: categoriaEnum.map((slug) => ({
                      slug,
                      etiqueta: ETIQUETAS[slug],
                    })),
                  },
                },
              },
            },
          },
        },
      },
      "/api/consultar": {
        get: {
          tags: ["Consulta"],
          summary: "Consultar dónde hay insumos",
          operationId: "consultar",
          description: [
            "Endpoint pensado para **otros sistemas**: bots, dashboards, mapas externos.",
            "",
            "Devuelve los puntos que coinciden y, si envías `lat`/`lng`, la distancia.",
            "",
            "**Atajo:** `?q=agua` o `?q=cobijas` filtra por categoría, no por nombre.",
            "Para buscar un lugar: `?q=Cuba`. Para las dos cosas: `?categoria=agua&q=Cuba`.",
          ].join("\n"),
          parameters: consultaParams,
          responses: {
            200: {
              description: "Resultados de la consulta.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["consulta", "total", "puntos"],
                    properties: {
                      consulta: {
                        type: "object",
                        description: "Filtros ya normalizados (útil para depurar).",
                      },
                      total: { type: "integer" },
                      puntos: { type: "array", items: puntoResumen },
                    },
                  },
                  example: {
                    consulta: {
                      q: null,
                      categoria: "cobijas",
                      con_stock: true,
                      lat: null,
                      lng: null,
                      radio: 5,
                      limit: 200,
                    },
                    total: 1,
                    puntos: [
                      {
                        id: "de854ab2-3796-4a17-8784-b852accd5334",
                        nombre: "Plaza de Bolívar",
                        nota: null,
                        lat: PEREIRA.lat,
                        lng: PEREIRA.lng,
                        created_at: "2026-08-16 16:28:57",
                        updated_at: "2026-08-16 16:29:07",
                        inventario: [
                          { categoria: "cobijas", etiqueta: "Cobijas", stock: 15 },
                          { categoria: "higiene", etiqueta: "Higiene", stock: 10 },
                        ],
                        tiene_stock: true,
                      },
                    ],
                  },
                },
              },
            },
            400: {
              description: "Filtro inválido (`categoria_invalida`, `q_invalida`, `radio_invalido`…).",
              content: { "application/json": { schema: errorSchema } },
            },
          },
        },
      },
      "/api/puntos": {
        get: {
          tags: ["Consulta"],
          summary: "Listar puntos de acopio",
          operationId: "listPuntos",
          description:
            "Lista usada por el mapa. Acepta los mismos filtros que `/api/consultar`, pero responde solo `{ puntos }` (sin envolver `consulta`/`total`).",
          parameters: consultaParams,
          responses: {
            200: {
              description: "Lista de puntos.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["puntos"],
                    properties: {
                      puntos: { type: "array", items: puntoResumen },
                    },
                  },
                },
              },
            },
            400: {
              description: "Filtro inválido.",
              content: { "application/json": { schema: errorSchema } },
            },
          },
        },
        post: {
          tags: ["Escritura"],
          summary: "Crear un punto de acopio",
          operationId: "crearPunto",
          description:
            "Crea un centro de acopio. Las coordenadas deben caer en la caja de Pereira. Reenvío con la misma `idempotency_key` → 200 y el punto ya creado.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["nombre", "lat", "lng", "idempotency_key"],
                  properties: {
                    nombre: { type: "string", minLength: 2, maxLength: 80 },
                    nota: { type: "string", maxLength: 200, nullable: true },
                    lat: { type: "number", example: PEREIRA.lat },
                    lng: { type: "number", example: PEREIRA.lng },
                    idempotency_key: { type: "string", format: "uuid" },
                  },
                },
                example: {
                  nombre: "Iglesia de Cuba",
                  nota: "Entran por el costado sur",
                  lat: 4.81,
                  lng: -75.7,
                  idempotency_key: "11111111-1111-4111-8111-111111111111",
                },
              },
            },
          },
          responses: {
            201: {
              description: "Punto creado.",
              content: { "application/json": { schema: puntoResumen } },
            },
            200: {
              description: "Replay de la misma `idempotency_key`.",
              content: { "application/json": { schema: puntoResumen } },
            },
            400: {
              description:
                "`nombre_invalido` | `fuera_de_zona` | `coordenada_invalida` | `url_no_permitida` | `idempotency_key_invalida`.",
              content: { "application/json": { schema: errorSchema } },
            },
            429: {
              description: "Rate limit.",
              content: { "application/json": { schema: errorSchema } },
            },
          },
        },
      },
      "/api/puntos/{id}": {
        get: {
          tags: ["Consulta"],
          summary: "Ficha de un punto + inventario + últimos movimientos",
          operationId: "getPunto",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            200: {
              description: "Ficha completa.",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      puntoResumen,
                      {
                        type: "object",
                        properties: {
                          movimientos: {
                            type: "array",
                            description: "Hasta 30, más recientes primero.",
                            items: movimiento,
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            404: {
              description: "`no_encontrado`.",
              content: { "application/json": { schema: errorSchema } },
            },
          },
        },
      },
      "/api/puntos/{id}/movimientos": {
        post: {
          tags: ["Escritura"],
          summary: "Registrar entrada o salida de insumos",
          operationId: "crearMovimiento",
          description: [
            "Dos modos:",
            "",
            "1. **Botón:** `{ tipo, categoria, cantidad, idempotency_key }`.",
            "2. **Voz / texto:** `{ tipo, texto, idempotency_key }`. El servidor parte el texto (`20 cobijas y 10 kits de aseo`) y puede crear **varios** movimientos.",
            "",
            "`tipo`: `entra` (llegó donación) o `sale` (se entregó).",
            "Una salida no deja stock negativo: recorta a lo disponible y marca `ajustado: true`. Si no hay nada: `400 sin_stock`.",
          ].join("\n"),
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["tipo", "idempotency_key"],
                  properties: {
                    tipo: { type: "string", enum: ["entra", "sale"] },
                    categoria: { type: "string", enum: categoriaEnum },
                    cantidad: { type: "integer", minimum: 1, maximum: 999 },
                    texto: {
                      type: "string",
                      maxLength: 280,
                      description: "Dictado. Si viene, se ignora categoria/cantidad.",
                    },
                    idempotency_key: { type: "string", format: "uuid" },
                  },
                },
                examples: {
                  boton: {
                    summary: "Toque de botón",
                    value: {
                      tipo: "entra",
                      categoria: "agua",
                      cantidad: 12,
                      idempotency_key: "22222222-2222-4222-8222-222222222222",
                    },
                  },
                  voz: {
                    summary: "Dictado",
                    value: {
                      tipo: "entra",
                      texto: "20 cobijas y 10 kits de aseo",
                      idempotency_key: "33333333-3333-4333-8333-333333333333",
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Movimiento(s) aplicados. `aplicados` son los de este request.",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      puntoResumen,
                      {
                        type: "object",
                        properties: {
                          movimientos: { type: "array", items: movimiento },
                          aplicados: { type: "array", items: movimiento },
                        },
                      },
                    ],
                  },
                },
              },
            },
            200: { description: "Replay de `idempotency_key`." },
            400: {
              description:
                "`tipo_invalido` | `categoria_invalida` | `cantidad_invalida` | `texto_invalido` | `sin_stock`.",
              content: { "application/json": { schema: errorSchema } },
            },
            404: {
              description: "El punto no existe.",
              content: { "application/json": { schema: errorSchema } },
            },
            429: {
              description: "Rate limit.",
              content: { "application/json": { schema: errorSchema } },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Error: errorSchema,
        Punto: puntoResumen,
        Movimiento: movimiento,
        ItemInventario: itemInventario,
      },
    },
  };
}
