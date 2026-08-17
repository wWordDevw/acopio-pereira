import { CATEGORIAS } from "../../api/src/categorias.js";
import { interpretar } from "./interpretar.js";
import { matchZona } from "./zonas.js";
import { consultarPuntos } from "./consultar.js";
import { isMenuHomeTrigger, parseMenuNumber, resolveMenu } from "./menu.js";
import {
  textoAyuda,
  textoPedirTexto,
  textoRateLimit,
  textoApiCaida,
  textoRespuesta,
  textoMenuInicio,
  textoMenuZona,
} from "./plantilla.js";

const HOUR_MS = 3_600_000;
const PENDING_MS = 15 * 60 * 1000;
const RATE_MAX = 20;
const MAX_TURNS = 3;

const KNOWN = new Set(CATEGORIAS.filter((c) => c !== "otro"));

const LLM_SYSTEM =
  "Only extract JSON {categoria,zona,intencion} from the user text. " +
  `categoria must be one of the slugs (${[...KNOWN].join(", ")}) or null. ` +
  "intencion is consultar, ayuda, or otro. zona is a place name or null. " +
  "Do not invent stock. Reply with JSON only.";

function stockOf(punto, categoria) {
  const item = (punto.inventario ?? []).find((x) => x.categoria === categoria);
  return item?.stock ?? 0;
}

function parseLlmJson(text) {
  if (text == null) return null;
  let raw = String(text).trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) raw = fenced[1].trim();
  try {
    const obj = JSON.parse(raw);
    if (obj == null || typeof obj !== "object") return null;
    return obj;
  } catch {
    return null;
  }
}

function usableText(text) {
  return typeof text === "string" && text.trim().length > 0;
}

/**
 * @param {{
 *   apiBase: string,
 *   publicWeb?: string,
 *   llm: { complete: Function },
 *   now?: () => number,
 *   fetchImpl?: typeof fetch,
 * }} opts
 */
export function createDialog({
  apiBase,
  publicWeb,
  llm,
  now = () => Date.now(),
  fetchImpl,
}) {
  const seenIds = new Set();
  /** @type {Map<string, number[]>} */
  const byFrom = new Map();
  /** @type {Map<string, { pantalla: "inicio"|"zona"|"barrios"|"resultados", categoria: string|null, zona: object|null, turno: number, actualizadoAt: number }>} */
  const pending = new Map();

  function countRecent(from, t) {
    const arr = (byFrom.get(from) ?? []).filter((ts) => t - ts < HOUR_MS);
    byFrom.set(from, arr);
    return arr.length;
  }

  function recordIncoming(from, t) {
    const arr = (byFrom.get(from) ?? []).filter((ts) => t - ts < HOUR_MS);
    arr.push(t);
    byFrom.set(from, arr);
  }

  function getPending(from, t) {
    const st = pending.get(from);
    if (!st) return null;
    if (t - st.actualizadoAt > PENDING_MS) {
      pending.delete(from);
      return null;
    }
    return st;
  }

  function showInicio(from, t, st) {
    pending.set(from, {
      pantalla: "inicio",
      categoria: null,
      zona: null,
      turno: st?.turno ?? 0,
      actualizadoAt: t,
    });
    return { send: true, text: textoAyuda() };
  }

  function replyAsk(from, t, st, { categoria = null, pantalla = "inicio" } = {}) {
    const turno = (st?.turno ?? 0) + 1;
    if (turno >= MAX_TURNS) {
      pending.set(from, {
        pantalla: "inicio",
        categoria: null,
        zona: null,
        turno: 0,
        actualizadoAt: t,
      });
      return { send: true, text: textoMenuInicio() };
    }
    pending.set(from, {
      pantalla,
      categoria,
      zona: pantalla === "zona" ? null : (st?.zona ?? null),
      turno,
      actualizadoAt: t,
    });
    const text =
      pantalla === "zona" && categoria
        ? textoMenuZona(categoria)
        : textoMenuInicio();
    return { send: true, text };
  }

  async function consultarYResponder(from, t, { categoria, zona, zonaTexto }) {
    try {
      let puntos = await consultarPuntos({
        apiBase,
        categoria,
        zona,
        fetchImpl,
      });
      if (!zona) {
        puntos = [...puntos].sort(
          (a, b) => stockOf(b, categoria) - stockOf(a, categoria),
        );
      }
      puntos = puntos.slice(0, 3);
      pending.set(from, {
        pantalla: "resultados",
        categoria: null,
        zona: null,
        turno: 0,
        actualizadoAt: t,
      });
      return {
        send: true,
        text: textoRespuesta({
          categoria,
          zonaNombre: zonaTexto ?? zona?.nombre ?? null,
          puntos,
          publicWeb,
        }),
      };
    } catch (err) {
      if (err?.code === "api_error") {
        pending.set(from, {
          pantalla: "resultados",
          categoria: null,
          zona: null,
          turno: 0,
          actualizadoAt: t,
        });
        return { send: true, text: textoApiCaida(publicWeb) };
      }
      throw err;
    }
  }

  /**
   * @param {{
   *   from: string,
   *   messageId: string,
   *   text?: string|null,
   *   hasMedia?: boolean,
   *   fromMe?: boolean,
   *   isGroup?: boolean,
   * }} msg
   */
  async function handleIncoming({
    from,
    messageId,
    text,
    hasMedia,
    fromMe,
    isGroup,
  }) {
    if (fromMe || isGroup) return { send: false, text: null };
    if (seenIds.has(messageId)) return { send: false, text: null };

    const t = now();
    if (countRecent(from, t) >= RATE_MAX) {
      seenIds.add(messageId);
      recordIncoming(from, t);
      return { send: true, text: textoRateLimit() };
    }

    seenIds.add(messageId);
    recordIncoming(from, t);

    if (hasMedia && !usableText(text)) {
      return { send: true, text: textoPedirTexto() };
    }

    const raw = usableText(text) ? String(text) : "";
    const st = getPending(from, t);

    if (isMenuHomeTrigger(raw)) {
      return showInicio(from, t, st);
    }

    const n = parseMenuNumber(raw);
    const menuScreen =
      st?.pantalla === "inicio" ||
      st?.pantalla === "zona" ||
      st?.pantalla === "barrios";
    if (menuScreen && n !== null) {
      const resolved = resolveMenu({
        pantalla: st.pantalla,
        n,
        categoria: st.categoria,
        publicWeb,
      });
      if (resolved.kind === "consultar") {
        return consultarYResponder(from, t, {
          categoria: resolved.categoria,
          zona: resolved.zona,
          zonaTexto: resolved.zona?.nombre ?? null,
        });
      }
      pending.set(from, {
        pantalla: resolved.next,
        categoria: resolved.categoria ?? null,
        zona: resolved.zona ?? null,
        turno: st.turno,
        actualizadoAt: t,
      });
      return { send: true, text: resolved.text };
    }

    let parsed = interpretar(raw);

    if (parsed.intencion === "ayuda") {
      return showInicio(from, t, st);
    }

    if (st?.categoria && !parsed.categoria) {
      const zonaMatch = parsed.zona || matchZona(raw);
      if (zonaMatch) {
        parsed = {
          ...parsed,
          categoria: st.categoria,
          zona: zonaMatch,
          zonaTexto: zonaMatch.nombre,
          intencion: "consultar",
          necesitaCategoria: false,
          necesitaZona: false,
        };
      }
    }

    if (
      parsed.necesitaCategoria ||
      (parsed.intencion === "otro" && !parsed.categoria)
    ) {
      try {
        const result = await llm.complete({
          messages: [
            { role: "system", content: LLM_SYSTEM },
            { role: "user", content: raw },
          ],
          maxTokens: 200,
        });
        const extracted = parseLlmJson(result?.text);
        if (!extracted) {
          return replyAsk(from, t, st, { categoria: null, pantalla: "inicio" });
        }
        if (extracted.intencion === "ayuda") {
          return showInicio(from, t, st);
        }
        if (extracted.categoria && KNOWN.has(extracted.categoria)) {
          parsed = {
            ...parsed,
            categoria: extracted.categoria,
            necesitaCategoria: false,
            intencion: "consultar",
          };
        }
        if (!parsed.zona && extracted.zona) {
          const z = matchZona(String(extracted.zona));
          if (z) {
            parsed = {
              ...parsed,
              zona: z,
              zonaTexto: z.nombre,
              necesitaZona: false,
            };
          }
        }
        if (!parsed.categoria) {
          return replyAsk(from, t, st, { categoria: null, pantalla: "inicio" });
        }
      } catch {
        return replyAsk(from, t, st, { categoria: null, pantalla: "inicio" });
      }
    }

    if (parsed.necesitaZona && !parsed.zona) {
      return replyAsk(from, t, st, {
        categoria: parsed.categoria,
        pantalla: "zona",
      });
    }

    if (!parsed.categoria) {
      return replyAsk(from, t, st, { categoria: null, pantalla: "inicio" });
    }

    return consultarYResponder(from, t, {
      categoria: parsed.categoria,
      zona: parsed.zona,
      zonaTexto: parsed.zonaTexto ?? parsed.zona?.nombre ?? null,
    });
  }

  return { handleIncoming };
}
