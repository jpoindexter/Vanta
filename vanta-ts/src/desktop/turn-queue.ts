import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

export type QueuedTurnTarget = {
  sessionId: string;
  root: string;
  controllerId: string;
  model: string;
  accessMode: "ask" | "approve" | "full";
};

export type QueuedTurn = {
  id: string;
  instruction: string;
  intent: "next" | "steer";
  status: "queued" | "starting";
  target: QueuedTurnTarget;
  position: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  ownerPid?: number;
};

export type TurnQueueSnapshot = { revision: number; items: QueuedTurn[] };

export type TurnQueueDeps = {
  read: () => Promise<string | null>;
  write: (content: string) => Promise<void>;
  now: () => Date;
  id: () => string;
  pid: () => number;
  isAlive: (pid: number) => boolean;
};

export class QueueConflictError extends Error {
  constructor(readonly code: "not_found" | "revision_conflict" | "already_started") {
    super(code === "already_started" ? "This queued turn has already started." : code === "revision_conflict" ? "This queued turn changed. Refresh and try again." : "Queued turn not found.");
    this.name = "QueueConflictError";
  }
}

type QueueDocument = { version: 1; revision: number; items: QueuedTurn[] };

function emptyDocument(): QueueDocument { return { version: 1, revision: 0, items: [] }; }

function parseDocument(raw: string | null): QueueDocument {
  if (!raw) return emptyDocument();
  try {
    const value = JSON.parse(raw) as Partial<QueueDocument>;
    if (value.version !== 1 || !Array.isArray(value.items)) return emptyDocument();
    return { version: 1, revision: Number.isInteger(value.revision) ? Math.max(0, value.revision!) : 0, items: value.items };
  } catch {
    return emptyDocument();
  }
}

function ordered(items: QueuedTurn[]): QueuedTurn[] {
  return [...items].sort((a, b) => a.target.sessionId.localeCompare(b.target.sessionId) || a.position - b.position || a.createdAt.localeCompare(b.createdAt));
}

function snapshot(document: QueueDocument, sessionId?: string): TurnQueueSnapshot {
  return { revision: document.revision, items: ordered(sessionId ? document.items.filter((item) => item.target.sessionId === sessionId) : document.items) };
}

export class DesktopTurnQueue {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: TurnQueueDeps) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation, operation);
    this.pending = next.then(() => undefined, () => undefined);
    return next;
  }

  private async load(): Promise<{ document: QueueDocument; recovered: boolean }> {
    const document = parseDocument(await this.deps.read());
    let recovered = false;
    document.items = document.items.map((item) => {
      if (item.status !== "starting" || !item.ownerPid || this.deps.isAlive(item.ownerPid)) return item;
      recovered = true;
      const { ownerPid: _ownerPid, ...rest } = item;
      return { ...rest, status: "queued", revision: item.revision + 1, updatedAt: this.deps.now().toISOString() };
    });
    if (recovered) document.revision += 1;
    return { document, recovered };
  }

  private async mutate<T>(operation: (document: QueueDocument) => T): Promise<T> {
    return this.serialize(async () => {
      const { document } = await this.load();
      const result = operation(document);
      document.revision += 1;
      await this.deps.write(JSON.stringify({ ...document, items: ordered(document.items) }, null, 2));
      return result;
    });
  }

  async list(sessionId?: string): Promise<TurnQueueSnapshot> {
    return this.serialize(async () => {
      const { document, recovered } = await this.load();
      if (recovered) await this.deps.write(JSON.stringify({ ...document, items: ordered(document.items) }, null, 2));
      return snapshot(document, sessionId);
    });
  }

  async enqueue(input: { instruction: string; target: QueuedTurnTarget }): Promise<QueuedTurn> {
    const instruction = input.instruction.trim();
    if (!instruction) throw new Error("message is required");
    return this.mutate((document) => {
      const positions = document.items.filter((item) => item.target.sessionId === input.target.sessionId).map((item) => item.position);
      const now = this.deps.now().toISOString();
      const item: QueuedTurn = {
        id: this.deps.id(), instruction, intent: "next", status: "queued", target: input.target,
        position: (positions.length ? Math.max(...positions) : 0) + 1,
        revision: 1, createdAt: now, updatedAt: now,
      };
      document.items.push(item);
      return item;
    });
  }

  async edit(id: string, revision: number, instruction: string): Promise<QueuedTurn> {
    const value = instruction.trim();
    if (!value) throw new Error("message is required");
    return this.mutate((document) => {
      const item = this.mutable(document, id, revision);
      item.instruction = value;
      return this.touch(item);
    });
  }

  async move(id: string, revision: number, direction: "up" | "down"): Promise<QueuedTurn> {
    return this.mutate((document) => {
      const item = this.mutable(document, id, revision);
      const siblings = ordered(document.items.filter((candidate) => candidate.target.sessionId === item.target.sessionId && candidate.status === "queued"));
      const index = siblings.findIndex((candidate) => candidate.id === id);
      const other = siblings[index + (direction === "up" ? -1 : 1)];
      if (other) [item.position, other.position] = [other.position, item.position];
      return this.touch(item);
    });
  }

  async steer(id: string, revision: number): Promise<QueuedTurn> {
    return this.mutate((document) => {
      const item = this.mutable(document, id, revision);
      const siblings = document.items.filter((candidate) => candidate.target.sessionId === item.target.sessionId && candidate.id !== item.id);
      item.position = siblings.length ? Math.min(...siblings.map((candidate) => candidate.position)) - 1 : 1;
      item.intent = "steer";
      return this.touch(item);
    });
  }

  async cancel(id: string, revision: number): Promise<void> {
    return this.mutate((document) => {
      this.mutable(document, id, revision);
      document.items = document.items.filter((item) => item.id !== id);
    });
  }

  async claimNext(sessionId: string): Promise<QueuedTurn | undefined> {
    return this.mutate((document) => {
      const item = ordered(document.items.filter((candidate) => candidate.target.sessionId === sessionId && candidate.status === "queued"))[0];
      if (!item) return undefined;
      item.status = "starting";
      item.ownerPid = this.deps.pid();
      return this.touch(item);
    });
  }

  async release(id: string): Promise<void> {
    return this.mutate((document) => {
      const item = document.items.find((candidate) => candidate.id === id);
      if (!item) return;
      delete item.ownerPid;
      item.status = "queued";
      this.touch(item);
    });
  }

  async complete(id: string): Promise<void> {
    return this.mutate((document) => { document.items = document.items.filter((item) => item.id !== id); });
  }

  private mutable(document: QueueDocument, id: string, revision: number): QueuedTurn {
    const item = document.items.find((candidate) => candidate.id === id);
    if (!item) throw new QueueConflictError("not_found");
    if (item.revision !== revision) throw new QueueConflictError("revision_conflict");
    if (item.status !== "queued") throw new QueueConflictError("already_started");
    return item;
  }

  private touch(item: QueuedTurn): QueuedTurn {
    item.revision += 1;
    item.updatedAt = this.deps.now().toISOString();
    return { ...item, target: { ...item.target } };
  }
}

export function desktopTurnQueuePath(root: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = createHash("sha256").update(root).digest("hex").slice(0, 16);
  return join(resolveVantaHome(env), "desktop-turn-queues", `${key}.json`);
}

export function fileTurnQueueDeps(path: string, env: NodeJS.ProcessEnv = process.env): TurnQueueDeps {
  return {
    read: async () => readFile(path, "utf8").catch(() => null),
    write: async (content) => {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, path);
    },
    now: () => new Date(), id: randomUUID, pid: () => process.pid,
    isAlive: (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; } },
  };
}
