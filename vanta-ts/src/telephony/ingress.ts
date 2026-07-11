import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ingestTwilioCallback, type CallbackInput } from "./service.js";
import type { TelephonyProfile } from "./schema.js";

export type TelephonyIngressOptions = {
  root: string; profile: TelephonyProfile; publicUrl: string; host?: string; port: number;
  ingest?: (input: CallbackInput) => Promise<{ ok: boolean; state: string }>;
  log?: (line: string) => void;
};

async function readForm(req: IncomingMessage, limit = 65_536): Promise<Record<string, string>> {
  const chunks: Buffer[] = [], declared = Number(req.headers["content-length"] ?? 0);
  if (declared > limit) throw new Error("callback body too large");
  let size = 0;
  for await (const chunk of req) { const value = Buffer.from(chunk); size += value.length; if (size > limit) throw new Error("callback body too large"); chunks.push(value); }
  const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  return Object.fromEntries(form.entries());
}

function respond(res: ServerResponse, status: number): void {
  res.writeHead(status, { "content-type": "text/plain", "cache-control": "no-store" }); res.end();
}

async function handle(req: IncomingMessage, res: ServerResponse, options: TelephonyIngressOptions): Promise<void> {
  if (req.method !== "POST" || req.url !== "/twilio") { respond(res, 404); return; }
  if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) { respond(res, 415); return; }
  try {
    const params = await readForm(req), signature = String(req.headers["x-twilio-signature"] ?? "");
    const ingest = options.ingest ?? ((input) => ingestTwilioCallback(options.root, input));
    const result = await ingest({ profile: options.profile, url: options.publicUrl, params, signature });
    options.log?.(`twilio callback ${result.ok ? "accepted" : "rejected"}: ${result.state}`);
    respond(res, result.ok ? 204 : 403);
  } catch { respond(res, 400); }
}

export function startTelephonyIngress(options: TelephonyIngressOptions): Server {
  const publicUrl = new URL(options.publicUrl);
  if (publicUrl.protocol !== "https:" || publicUrl.pathname !== "/twilio") throw new Error("public callback URL must be HTTPS and end in /twilio");
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) throw new Error("invalid callback port");
  const server = createServer((req, res) => { void handle(req, res, options); });
  server.listen(options.port, options.host ?? "127.0.0.1");
  return server;
}
