import { createServer as createHttpServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDialog } from "./dialog.js";
import { createLlm } from "./llm/router.js";
import { createMessaging } from "./messaging/create.js";

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
 *   messaging: import("./messaging/port.js").Messaging,
 * }} opts
 */
export function createBotServer({ dialog, messaging }) {
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
      json(res, 200, {
        ok: true,
        provider: messaging.name,
        messaging: "ok",
      });
      return;
    }

    const isHookPath =
      url.pathname === "/webhook" || url.pathname === "/wa-hook";

    if (req.method === "GET" && isHookPath) {
      const verdict = messaging.verifyWebhook(url.searchParams);
      if (verdict == null) {
        json(res, 404, { error: "no_encontrado" });
        return;
      }
      if (verdict.ok === true) {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end(verdict.challenge);
        return;
      }
      json(res, 403, { error: "no_autorizado" });
      return;
    }

    if (req.method === "POST" && isHookPath) {
      const rawBody = await readBody(req);
      if (!messaging.verifySignature({ headers: req.headers, rawBody })) {
        json(res, 401, { error: "no_autorizado" });
        return;
      }

      let body;
      try {
        body = JSON.parse(rawBody);
      } catch {
        json(res, 400, { error: "json_invalido" });
        return;
      }

      try {
        for (const msg of messaging.parseIncoming(body)) {
          const result = await dialog.handleIncoming(msg);
          if (result?.send) {
            try {
              await messaging.sendText({
                to: msg.from,
                text: result.text ?? "",
              });
            } catch (err) {
              console.error("sendText failed", err?.message);
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
 * Wire LLM + dialog + messaging from env and listen.
 * PORT default 3001. Provider via WHATSAPP_PROVIDER (default waha).
 * WAHA_SESSION is required when provider is waha (Dokploy env).
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
  const messaging = createMessaging(env, { fetchImpl });
  const llm = createLlm(env, { fetchImpl });
  const dialog = createDialog({
    apiBase: env.API_BASE,
    publicWeb: env.PUBLIC_WEB,
    llm,
    fetchImpl,
  });
  const server = createBotServer({ dialog, messaging });
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
