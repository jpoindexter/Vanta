import { createServer, type Server } from "node:http";
import type { PlatformWebhookHandler } from "./platforms/base.js";

const MAX_BODY_BYTES = 1_048_576;

export type PlatformWebhookServer = { port: number; close: () => Promise<void> };

export function startPlatformWebhookServer(opts: {
  port: number;
  host?: string;
  handlers: PlatformWebhookHandler[];
  log?: (message: string) => void;
}): Promise<PlatformWebhookServer> {
  const log = opts.log ?? ((message: string) => console.log(message));
  const handlers = new Map(opts.handlers.map((handler) => [handler.path, handler]));
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const handler = handlers.get(path);
    if (!handler) return void res.writeHead(404).end("not found");
    if (req.method !== "POST") return void res.writeHead(405).end("method not allowed");

    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return void res.writeHead(413).end("payload too large");
      const body = Buffer.concat(chunks).toString("utf8");
      void handler.receive({ body, headers: req.headers }).then((reply) => {
        res.writeHead(reply.status, { "content-type": "text/plain; charset=utf-8" }).end(reply.body);
      }).catch((error: unknown) => {
        log(`messaging webhook error: ${error instanceof Error ? error.message : String(error)}`);
        res.writeHead(500).end("internal error");
      });
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    const host = opts.host ?? "127.0.0.1";
    server.listen(opts.port, host, () => {
      server.off("error", reject);
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : opts.port;
      log(`vanta gateway: messaging webhook listener on ${host}:${port}`);
      resolve({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}
