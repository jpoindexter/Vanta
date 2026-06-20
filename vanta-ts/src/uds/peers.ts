import net from "node:net";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// UDS peer agents — lower-latency local IPC for cross-session collaboration,
// distinct from the file-based swarm/A2A mailbox. Each live Vanta session
// advertises itself by binding a Unix-domain-socket listener and writing a
// small JSON descriptor under ~/.vanta/peers/. Other sessions enumerate the
// descriptors, prune dead ones, and connect over the socket to deliver a
// message into the target's inbox file.

/** A peer's on-disk descriptor (~/.vanta/peers/<id>.json). */
export const PeerEntrySchema = z.object({
  id: z.string().min(1),
  pid: z.number().int().positive(),
  startedAt: z.string().min(1),
  socket: z.string().min(1),
  title: z.string().optional(),
});
export type PeerEntry = z.infer<typeof PeerEntrySchema>;

/** A message sent peer-to-peer over the socket. */
export const PeerMessageSchema = z.object({
  from: z.string().min(1),
  text: z.string().min(1),
});
export type PeerMessage = z.infer<typeof PeerMessageSchema>;

/** Outcome of advertising — the bound server plus a stop() that tears it down. */
export type PeerHandle = {
  id: string;
  socket: string;
  server: net.Server;
  /** Inbox messages this peer has received over the socket, in arrival order. */
  inbox: PeerMessage[];
  stop: () => Promise<void>;
};

/** The peers registry directory: ~/.vanta/peers (VANTA_HOME-overridable). */
export function peersDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "peers");
}

/**
 * Resolve a short, length-safe socket path for a session. UDS paths are capped
 * (~104 bytes on macOS, 108 on Linux); a deep VANTA_HOME plus a long id can
 * blow that, so the socket filename is a hash of the id. The real path is
 * recorded in the descriptor, so peers connect via the stored path, never by
 * reconstructing it.
 */
export function socketPathFor(id: string, env: NodeJS.ProcessEnv = process.env): string {
  const short = createHash("sha1").update(id).digest("hex").slice(0, 16);
  return join(peersDir(env), `${short}.sock`);
}

/** Pure: parse one descriptor's text into a PeerEntry, or null if invalid. */
export function parsePeerEntry(text: string): PeerEntry | null {
  try {
    const parsed = PeerEntrySchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Pure: a one-line-per-peer human listing (id, title, pid). */
export function formatPeers(peers: PeerEntry[], self?: string): string {
  if (peers.length === 0) return "  (no other live Vanta peers)";
  const rows = peers.map((p) => {
    const me = p.id === self ? " (you)" : "";
    const title = p.title ? `  ${p.title}` : "";
    return `  ${p.id}${me}  pid:${p.pid}${title}`;
  });
  return `  ${peers.length} live peer(s):\n${rows.join("\n")}`;
}

/** True if a process with this pid is alive (signal 0 probe). */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process (dead). EPERM = exists but not ours (alive).
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

const jsonPath = (dir: string, id: string): string =>
  join(dir, `${id.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);

/** Read one newline-delimited JSON message from a socket data chunk. */
function decodeMessage(chunk: Buffer): PeerMessage | null {
  const parsed = PeerMessageSchema.safeParse(
    (() => {
      try {
        return JSON.parse(chunk.toString("utf8"));
      } catch {
        return null;
      }
    })(),
  );
  return parsed.success ? parsed.data : null;
}

/**
 * Advertise this session as a live peer: bind a UDS listener and write the
 * JSON descriptor. Incoming connections deliver one JSON message which is
 * appended to the handle's inbox (and to onMessage, if provided). Returns a
 * handle whose stop() unbinds the socket and removes both files.
 */
export async function advertisePeer(
  args: { id: string; title?: string; onMessage?: (m: PeerMessage) => void },
  env: NodeJS.ProcessEnv = process.env,
): Promise<PeerHandle> {
  const dir = peersDir(env);
  await mkdir(dir, { recursive: true });
  const socket = socketPathFor(args.id, env);
  // A stale socket file from a crashed prior session blocks bind(); clear it.
  await rm(socket, { force: true });

  const inbox: PeerMessage[] = [];
  const server = net.createServer((conn) => {
    conn.on("data", (chunk) => {
      const msg = decodeMessage(chunk);
      if (msg) {
        inbox.push(msg);
        args.onMessage?.(msg);
      }
      conn.end();
    });
    conn.on("error", () => conn.destroy());
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const entry: PeerEntry = {
    id: args.id,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    socket,
    ...(args.title ? { title: args.title } : {}),
  };
  await writeFile(jsonPath(dir, args.id), JSON.stringify(entry), "utf8");

  const stop = async (): Promise<void> => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(socket, { force: true });
    await rm(jsonPath(dir, args.id), { force: true });
  };
  return { id: args.id, socket, server, inbox, stop };
}

/** Remove a peer's descriptor + socket (clean-shutdown / external cleanup). */
export async function unadvertisePeer(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const dir = peersDir(env);
  await rm(socketPathFor(id, env), { force: true });
  await rm(jsonPath(dir, id), { force: true });
}

/** True if a UDS at this path accepts a connection (the listener is live). */
function socketConnectable(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = net.connect(path);
    const done = (ok: boolean) => {
      conn.removeAllListeners();
      conn.destroy();
      resolve(ok);
    };
    conn.once("connect", () => done(true));
    conn.once("error", () => done(false));
  });
}

/**
 * Enumerate live peers: every descriptor whose pid is alive AND whose socket is
 * connectable, excluding self. Stale descriptors (dead pid or dead socket) are
 * pruned from disk on read so the registry self-heals.
 */
export async function listPeers(
  env: NodeJS.ProcessEnv = process.env,
  selfId?: string,
): Promise<PeerEntry[]> {
  const dir = peersDir(env);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return []; // no peers dir yet
  }
  const live: PeerEntry[] = [];
  for (const file of files) {
    const full = join(dir, file);
    const entry = parsePeerEntry(await readFile(full, "utf8").catch(() => ""));
    if (!entry) {
      await rm(full, { force: true });
      continue;
    }
    const alive = pidAlive(entry.pid) && (await socketConnectable(entry.socket));
    if (!alive) {
      // Prune the dead descriptor (and any orphaned socket file) on read.
      await rm(full, { force: true });
      await rm(entry.socket, { force: true });
      continue;
    }
    if (entry.id !== selfId) live.push(entry);
  }
  return live.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/**
 * Connect to a peer's UDS and deliver one JSON message. Resolves to a result
 * value (never throws) so callers can report delivered/failed. The peer is
 * looked up by id from its on-disk descriptor (uses the recorded socket path).
 */
export async function sendToPeer(
  id: string,
  msg: PeerMessage,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = PeerMessageSchema.safeParse(msg);
  if (!parsed.success) return { ok: false, error: "invalid message" };
  const dir = peersDir(env);
  const entry = parsePeerEntry(await readFile(jsonPath(dir, id), "utf8").catch(() => ""));
  if (!entry) return { ok: false, error: `no peer "${id}"` };

  return new Promise((resolve) => {
    const conn = net.connect(entry.socket);
    const fail = (error: string) => {
      conn.removeAllListeners();
      conn.destroy();
      resolve({ ok: false, error });
    };
    conn.once("error", () => fail(`peer "${id}" is unreachable`));
    conn.once("connect", () => {
      conn.write(JSON.stringify(parsed.data), (err) => {
        if (err) return fail(err.message);
        conn.end(() => resolve({ ok: true }));
      });
    });
  });
}
