import { createServer, type Server } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appendFile } from "node:fs/promises";

// E3 — webhook triggers + deliver targets. An HTTP endpoint (run inside the
// gateway daemon) that authenticates inbound events by HMAC, runs them as an
// agent turn, and delivers the result to a configured target. GitHub/GitLab/
// Stripe/etc. send X-Hub-Signature-256: sha256=<hex over the raw body>.

/**
 * Constant-time verify of a GitHub-style `sha256=<hex>` HMAC signature over the
 * raw body. Pure. Returns false on a missing/!-length-matching signature.
 */
export function verifyGithubSignature(
  secret: string,
  body: string,
  header: string | undefined,
): boolean {
  if (!header) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type Deliver = (text: string) => Promise<void>;

/** Injected sinks a delivery builder may need (kept out of the pure builders). */
export type DeliverDeps = { telegram?: (chatId: string, text: string) => Promise<void> };
/** Builds a Deliver from the target's `rest` (the part after `scheme:`). */
export type DeliverBuilder = (rest: string, deps: DeliverDeps) => Deliver;

// PORT-DELIVERY-REGISTRY — delivery targets resolve through a registry, so a new
// channel (e.g. `slack:`) is a `registerDeliveryTarget("slack", …)` call, not an
// edit to a switch in resolveDeliver. Built-ins register below.
const DELIVERY_TARGETS = new Map<string, DeliverBuilder>();

/** Register (or override) the builder for a `scheme:` delivery target. */
export function registerDeliveryTarget(scheme: string, build: DeliverBuilder): void {
  DELIVERY_TARGETS.set(scheme, build);
}

registerDeliveryTarget("local", () => async (t) => void console.log(t));
registerDeliveryTarget("file", (path) => async (t) => appendFile(path, `${t}\n`, "utf8"));
registerDeliveryTarget("telegram", (chatId, deps) => {
  if (!deps.telegram) throw new Error("telegram deliver target needs VANTA_TELEGRAM_TOKEN set");
  return async (t) => deps.telegram!(chatId, t);
});

/**
 * Resolve a `--deliver`-style target into a delivery function via the registry.
 * `scheme` is the part before the first `:` (bare `local`/`""` → `local`); the
 * remainder is passed to the registered builder. Pure (the returned closure
 * does the I/O). Shared by cron + webhooks.
 */
export function resolveDeliver(
  target: string,
  telegram?: (chatId: string, text: string) => Promise<void>,
): Deliver {
  const t = target === "" ? "local" : target;
  const colon = t.indexOf(":");
  const scheme = colon >= 0 ? t.slice(0, colon) : t;
  const rest = colon >= 0 ? t.slice(colon + 1) : "";
  const build = DELIVERY_TARGETS.get(scheme);
  if (!build) {
    throw new Error(`unknown deliver target "${target}" (registered: ${[...DELIVERY_TARGETS.keys()].join(" | ")})`);
  }
  return build(rest, { telegram });
}

export type WebhookServer = { port: number; close: () => Promise<void> };

/**
 * Start the webhook HTTP listener. POST only; when `secret` is set, the
 * `x-hub-signature-256` HMAC is required and verified before `onEvent` fires.
 * Responds 200 fast and runs `onEvent` in the background (a long agent turn must
 * not hold the connection). Resolves once listening.
 */
export function startWebhookServer(opts: {
  port: number;
  secret?: string;
  onEvent: (body: string) => Promise<void> | void;
  log?: (msg: string) => void;
}): Promise<WebhookServer> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const server: Server = createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405).end("method not allowed");
      return;
    }
    let body = "";
    req.on("data", (c: Buffer) => {
      body += c.toString("utf8");
    });
    req.on("end", () => {
      if (opts.secret) {
        const sig = req.headers["x-hub-signature-256"];
        if (!verifyGithubSignature(opts.secret, body, Array.isArray(sig) ? sig[0] : sig)) {
          res.writeHead(401).end("bad signature");
          return;
        }
      }
      res.writeHead(200).end("ok");
      Promise.resolve(opts.onEvent(body)).catch((err: unknown) =>
        log(`webhook onEvent error: ${err instanceof Error ? err.message : String(err)}`),
      );
    });
  });

  return new Promise<WebhookServer>((resolve) => {
    server.listen(opts.port, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : opts.port;
      log(`vanta gateway: webhook listener on :${port}${opts.secret ? " (HMAC-verified)" : " (UNAUTHENTICATED — set VANTA_WEBHOOK_SECRET)"}`);
      resolve({
        port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}
