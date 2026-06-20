import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  advertisePeer,
  listPeers,
  sendToPeer,
  unadvertisePeer,
  peersDir,
  socketPathFor,
  parsePeerEntry,
  formatPeers,
  type PeerHandle,
  type PeerEntry,
} from "./peers.js";

let home: string;
let env: NodeJS.ProcessEnv;
const handles: PeerHandle[] = [];

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-peers-"));
  env = { ...process.env, VANTA_HOME: home };
});

afterEach(async () => {
  // Tear down every socket/server opened in the test so no listener leaks.
  for (const h of handles.splice(0)) await h.stop().catch(() => {});
  await rm(home, { recursive: true, force: true });
});

async function advertise(id: string, title?: string): Promise<PeerHandle> {
  const h = await advertisePeer({ id, title }, env);
  handles.push(h);
  return h;
}

describe("uds/peers — pure helpers", () => {
  it("parsePeerEntry accepts a valid descriptor and rejects junk", () => {
    const valid = JSON.stringify({ id: "a", pid: 1, startedAt: "t", socket: "/s" });
    expect(parsePeerEntry(valid)?.id).toBe("a");
    expect(parsePeerEntry("not json")).toBeNull();
    expect(parsePeerEntry(JSON.stringify({ id: "a" }))).toBeNull();
  });

  it("formatPeers lists peers and marks self", () => {
    const peers: PeerEntry[] = [
      { id: "one", pid: 11, startedAt: "t", socket: "/s1", title: "Builder" },
      { id: "two", pid: 22, startedAt: "t", socket: "/s2" },
    ];
    const out = formatPeers(peers, "two");
    expect(out).toContain("2 live peer(s)");
    expect(out).toContain("one  pid:11  Builder");
    expect(out).toContain("two (you)  pid:22");
    expect(formatPeers([])).toContain("no other live");
  });

  it("socketPathFor stays inside the peers dir and is length-safe", () => {
    const p = socketPathFor("a-very-long-session-id-1234567890", env);
    expect(p.startsWith(peersDir(env))).toBe(true);
    expect(p.endsWith(".sock")).toBe(true);
    // Hashed filename keeps UDS paths well under the OS cap.
    expect(p.length).toBeLessThan(104);
  });
});

describe("uds/peers — live UDS round-trip", () => {
  it("listPeers returns other live peers, excluding self", async () => {
    await advertise("alpha", "Alpha session");
    await advertise("beta");

    const fromAlpha = await listPeers(env, "alpha");
    expect(fromAlpha.map((p) => p.id)).toEqual(["beta"]);

    const all = await listPeers(env);
    expect(all.map((p) => p.id).sort()).toEqual(["alpha", "beta"]);
    expect(all.find((p) => p.id === "alpha")?.title).toBe("Alpha session");
  });

  it("sendToPeer delivers a message into the target's inbox", async () => {
    const received: { from: string; text: string }[] = [];
    await advertise("sender");
    const target = await advertisePeer(
      { id: "target", onMessage: (m) => received.push(m) },
      env,
    );
    handles.push(target);

    const res = await sendToPeer("target", { from: "sender", text: "hello peer" }, env);
    expect(res.ok).toBe(true);

    // Give the listener a tick to append.
    await new Promise((r) => setTimeout(r, 20));
    expect(target.inbox).toEqual([{ from: "sender", text: "hello peer" }]);
    expect(received).toEqual([{ from: "sender", text: "hello peer" }]);
  });

  it("sendToPeer reports failure for an unknown peer", async () => {
    const res = await sendToPeer("ghost", { from: "x", text: "y" }, env);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("ghost");
  });

  it("listPeers prunes a stale descriptor whose socket is dead", async () => {
    // Write a descriptor that points at a socket path with no listener bound.
    const dead: PeerEntry = {
      id: "zombie",
      pid: process.pid, // alive pid, but...
      startedAt: new Date().toISOString(),
      socket: join(peersDir(env), "nonexistent.sock"), // ...no listener here
    };
    const { mkdir, writeFile: wf } = await import("node:fs/promises");
    await mkdir(peersDir(env), { recursive: true });
    const file = join(peersDir(env), "zombie.json");
    await wf(file, JSON.stringify(dead), "utf8");

    const live = await advertise("live-one");
    void live;

    const peers = await listPeers(env);
    expect(peers.map((p) => p.id)).toEqual(["live-one"]);
    // The stale descriptor was pruned from disk on read.
    const remaining = await readdir(peersDir(env));
    expect(remaining).not.toContain("zombie.json");
  });

  it("unadvertisePeer removes the descriptor and socket", async () => {
    const h = await advertisePeer({ id: "leaver" }, env);
    handles.push(h);
    expect((await readdir(peersDir(env))).some((f) => f.endsWith(".json"))).toBe(true);

    await h.stop();
    await unadvertisePeer("leaver", env);
    expect((await listPeers(env)).map((p) => p.id)).not.toContain("leaver");
  });

  it("listPeers drops a corrupt descriptor", async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(peersDir(env), { recursive: true });
    await writeFile(join(peersDir(env), "garbage.json"), "{ not valid", "utf8");
    const peers = await listPeers(env);
    expect(peers).toEqual([]);
    expect(await readdir(peersDir(env))).not.toContain("garbage.json");
  });
});
