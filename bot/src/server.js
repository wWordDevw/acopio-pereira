import { createServer as createHttpServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDialog } from "./dialog.js";
import { createLlm } from "./llm/router.js";
import { sendText } from "./waha.js";
import { normalizeWahaEvent } from "./webhook.js";

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * @param {{
 *   dialog: { handleIncoming: Function },
 *   wahaBase: string,
 *   wahaKey?: string,
 *   session: string,
 *   fetchImpl?: typeof fetch,
 * }} opts
 */
export function createBotServer({
  dialog,
  wahaBase,
  wahaKey,
  session,
  fetchImpl,
}) {
  return createHttpServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error("bot server error", err?.message);
      if (!res.headersSent) {
        json(res, 500, { error: "error_interno" });
      }
    });
  });

  async function handle(req, res) {
    const url = new URL(req.url || "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/salud") {
      json(res, 200, { ok: true, waha: "unknown" });
      return;
    }

    if (req.method === "POST" && url.pathname === "/webhook") {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        json(res, 400, { error: "json_invalido" });
        return;
      }

      try {
        const msg = normalizeWahaEvent(body);
        if (msg) {
          const result = await dialog.handleIncoming(msg);
          if (result?.send) {
            try {
              await sendText({
                wahaBase,
                apiKey: wahaKey,
                session,
                chatId: msg.from,
                text: result.text ?? "",
                fetchImpl,
              });
            } catch (err) {
              console.error("waha sendText failed", err?.message);
            }
          }
        }
      } catch (err) {
        console.error("webhook handle failed", err?.message);
      }

      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { error: "no_encontrado" });
  }
}

/**
 * Wire LLM + dialog from env and listen.
 * PORT default 3001; WAHA_SESSION default `default`.
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   port?: number,
 *   host?: string,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 */
export function listen(options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl;
  const llm = createLlm(env, { fetchImpl });
  const dialog = createDialog({
    apiBase: env.API_BASE,
    publicWeb: env.PUBLIC_WEB,
    llm,
    fetchImpl,
  });
  const server = createBotServer({
    dialog,
    wahaBase: env.WAHA_BASE,
    wahaKey: env.WAHA_API_KEY,
    session: env.WAHA_SESSION || "default",
    fetchImpl,
  });
  const port = Number(options.port ?? env.PORT ?? 3001);
  server.listen(port, options.host ?? "0.0.0.0");
  return server;
}

const invokedAsMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedAsMain) {
  listen();
}
