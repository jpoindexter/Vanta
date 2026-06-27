import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import type { Server } from "node:net";
import { resolveVantaHome } from "../store/home.js";

// UDS peer DESCRIPTOR + REGISTRY primitives — the pure data model and path/parse/
// format/liveness helpers (extracted from peers.ts for the file size gate). No
// socket I/O lives here; the net server/client operations stay in peers.ts.

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
  server: Server;
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
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process (dead). EPERM = exists but not ours (alive).
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The on-disk descriptor path for a peer id (id sanitized to a safe filename). */
export const jsonPath = (dir: string, id: string): string =>
  join(dir, `${id.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
