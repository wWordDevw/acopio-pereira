import { CATEGORIAS } from "../../api/src/categorias.js";
import { interpretar } from "./interpretar.js";
import { matchZona } from "./zonas.js";
import { consultarPuntos } from "./consultar.js";
import {
  textoAyuda,
  textoPedirTexto,
  textoPedirCategoria,
  textoPedirZona,
  textoNoEntendi,
  textoRateLimit,
  textoApiCaida,
  textoRespuesta,
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
  /** @type {Map<string, { categoria: string|null, zona: object|null, turno: number, actualizadoAt: number }>} */
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

  function replyAsk(from, t, st, categoria, text) {
    const turno = (st?.turno ?? 0) + 1;
    if (turno >= MAX_TURNS) {
      pending.delete(from);
      return { send: true, text: textoNoEntendi() };
    }
    pending.set(from, {
      categoria: categoria ?? st?.categoria ?? null,
      zona: st?.zona ?? null,
      turno,
      actualizadoAt: t,
    });
    return { send: true, text };
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
    let parsed = interpretar(raw);

    if (parsed.intencion === "ayuda") {
      return { send: true, text: textoAyuda() };
    }

    const st = getPending(from, t);
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
      const originalIntencion = parsed.intencion;
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
          const fallback =
            originalIntencion === "otro"
              ? textoNoEntendi()
              : textoPedirCategoria();
          return replyAsk(from, t, st, parsed.categoria, fallback);
        }
        if (extracted.intencion === "ayuda") {
          return { send: true, text: textoAyuda() };
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
          return replyAsk(from, t, st, null, textoPedirCategoria());
        }
      } catch {
        const fallback =
          originalIntencion === "otro"
            ? textoNoEntendi()
            : textoPedirCategoria();
        return replyAsk(from, t, st, parsed.categoria, fallback);
      }
    }

    if (parsed.necesitaZona && !parsed.zona) {
      return replyAsk(from, t, st, parsed.categoria, textoPedirZona());
    }

    if (!parsed.categoria) {
      const turns = (st?.turno ?? 0) + 1;
      if (turns >= MAX_TURNS) {
        pending.delete(from);
        return { send: true, text: textoNoEntendi() };
      }
      return replyAsk(from, t, st, st?.categoria ?? null, textoPedirCategoria());
    }

    try {
      let puntos = await consultarPuntos({
        apiBase,
        categoria: parsed.categoria,
        zona: parsed.zona,
        fetchImpl,
      });
      if (!parsed.zona) {
        puntos = [...puntos].sort(
          (a, b) => stockOf(b, parsed.categoria) - stockOf(a, parsed.categoria),
        );
      }
      puntos = puntos.slice(0, 3);
      pending.delete(from);
      return {
        send: true,
        text: textoRespuesta({
          categoria: parsed.categoria,
          zonaNombre: parsed.zonaTexto ?? parsed.zona?.nombre ?? null,
          puntos,
          publicWeb,
        }),
      };
    } catch (err) {
      if (err?.code === "api_error") {
        pending.delete(from);
        return { send: true, text: textoApiCaida(publicWeb) };
      }
      throw err;
    }
  }

  return { handleIncoming };
}
