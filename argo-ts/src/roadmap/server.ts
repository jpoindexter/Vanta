import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { moveRoadmapItem, WipLimitError } from "./move.js";
import { STATUS, type Status } from "./schema.js";

export function createRoadmapServer(repoRoot: string): Server {
  return createServer(async (req, res) => {
    const url = req.url ?? "/";

    if (req.method === "GET" && (url === "/" || url === "/roadmap/board")) {
      try {
        const html = await readFile(join(repoRoot, "roadmap.html"), "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("roadmap.html not found — run `argo roadmap` first");
      }
      return;
    }

    if (req.method === "POST" && url === "/roadmap/move") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
          if (typeof body !== "object" || body === null) throw new Error("body must be a JSON object");
          const { id, status } = body as Record<string, unknown>;
          if (typeof id !== "string") throw new Error("id must be a string");
          if (typeof status !== "string") throw new Error("status must be a string");
          if (!(STATUS as readonly string[]).includes(status)) {
            throw new Error(`invalid status '${status}' — must be one of: ${STATUS.join(", ")}`);
          }
          const item = await moveRoadmapItem(repoRoot, id, status as Status);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, id: item.id, status: item.status, title: item.title }));
        } catch (err) {
          if (err instanceof WipLimitError) {
            res.writeHead(409, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: err.message, wip: { count: err.count, limit: err.limit } }));
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
          }
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });
}

export async function serveRoadmap(repoRoot: string, port: number): Promise<void> {
  const server = createRoadmapServer(repoRoot);

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  console.log(`  → Roadmap board: http://localhost:${port}/roadmap/board`);
  console.log("  → Ctrl+C to stop");

  await new Promise<void>((resolve) => {
    const shutdown = (): void => { server.close(() => resolve()); };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
