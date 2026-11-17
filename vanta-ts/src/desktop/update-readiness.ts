import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type http from "node:http";
import { sendJson } from "./handler-http.js";
import type { SessionMap } from "./session-state.js";
import { resolveVantaHome } from "../store/home.js";

const PREPARE = "/api/desktop/update/prepare";
const CANCEL = "/api/desktop/update/cancel";
const BUSY = "Finish active work, approvals and queued instructions before restarting to update.";

/** Per-server admission fence. A lease lasts until exact cancellation or process exit. */
export class DesktopUpdateReadiness {
  private activeMutations = 0;
  private lease: string | undefined;
  private prepared = false;

  constructor(private readonly options: { sessions: SessionMap; root: string; home: string; env: NodeJS.ProcessEnv }) {}

  isEndpoint(pathname: string): boolean { return pathname === PREPARE || pathname === CANCEL; }

  /** Reserve synchronously, before any route/body/auth await; release after the handler, not HTTP finish. */
  admit(method: string | undefined): (() => void) | undefined {
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return () => {};
    if (this.lease) return undefined;
    this.activeMutations++;
    let released = false;
    return () => { if (!released) { released = true; this.activeMutations--; } };
  }

  async handle(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void> {
    if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
    if (pathname === PREPARE) return this.prepare(res);
    let lease: string;
    try { lease = await readLease(req); }
    catch { return sendJson(res, 400, { error: "a single update lease is required" }); }
    if (!this.prepared || lease !== this.lease) return sendJson(res, 409, { error: "update lease does not match" });
    this.lease = undefined;
    this.prepared = false;
    sendJson(res, 200, { ok: true });
  }

  private async prepare(res: http.ServerResponse): Promise<void> {
    if (this.lease) return sendJson(res, 409, { error: "an update is already being prepared" });
    const lease = randomUUID();
    this.lease = lease;
    try {
      if (this.activeMutations || await runtimeBusy(this.options)) return sendJson(res, 409, { error: BUSY });
      this.prepared = true;
      sendJson(res, 200, { ok: true, lease });
    } catch {
      sendJson(res, 409, { error: "Could not establish safe update readiness. No restart was authorized." });
    } finally {
      if (!this.prepared && this.lease === lease) this.lease = undefined;
    }
  }
}

async function readLease(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const data = Buffer.from(chunk);
    bytes += data.length;
    if (bytes > 256) throw new Error("lease body too large");
    chunks.push(data);
  }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid lease");
  const record = body as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || typeof record.lease !== "string" || record.lease.length > 64) throw new Error("invalid lease");
  return record.lease;
}

async function runtimeBusy(options: { sessions: SessionMap; root: string; home: string; env: NodeJS.ProcessEnv }): Promise<boolean> {
  const { desktopTurnQueuePath } = await import("./turn-queue.js");
  const { runningTaskIds } = await import("./company-run-state.js");
  const states = [...options.sessions.values(), { root: options.root, _env: options.env }];
  const active = () => [...options.sessions.values()].some(state => state._chatActive || state.pendingApproval);
  const homes = new Set([options.home, ...states.map(state => resolveVantaHome(state._env ?? options.env))]);
  const companyActive = () => [...homes].some(home => runningTaskIds(home).length > 0);
  if (active() || companyActive()) return true;
  const queues = new Set([...options.sessions.values()].map(state => state._turnQueue).filter(queue => queue !== undefined));
  for (const queue of queues) if ((await queue.list()).items.length > 0) return true;
  const paths = new Set(states.flatMap(state => [desktopTurnQueuePath(state.root, state._env ?? options.env), desktopTurnQueuePath(state.root, { VANTA_HOME: options.home })]));
  for (const path of paths) if (await persistedQueueBusy(path)) return true;
  return active() || companyActive();
}

/** A corrupt/unreadable queue is unknown, not proof of an empty queue. Never rewrite it here. */
async function persistedQueueBusy(path: string): Promise<boolean> {
  let raw: string;
  try { raw = await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  const document = JSON.parse(raw) as { version?: unknown; items?: unknown } | null;
  if (!document || document.version !== 1 || !Array.isArray(document.items)) throw new Error("invalid queue evidence");
  return document.items.length > 0;
}
