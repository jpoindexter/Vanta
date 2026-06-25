import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openSession,
  sendToSession,
  readSession,
  closeSession,
  listSessions,
  knownInteractiveAgents,
  type SessionBackend,
} from "./agent-session.js";

/** A fake tmux that REMEMBERS what was sent, so context-carry is testable offline. */
class FakeBackend implements SessionBackend {
  panes = new Map<string, string>();
  history = new Map<string, string[]>();
  isAvailable = true;

  available() {
    return this.isAvailable;
  }
  start(name: string, command: string) {
    this.panes.set(name, `$ ${command}\n${command} ready\n> `);
    this.history.set(name, []);
  }
  sendText(name: string, text: string) {
    const hist = this.history.get(name) ?? [];
    hist.push(text);
    this.history.set(name, hist);
    // Echo a "reply" that reflects the full conversation so far (proves context).
    this.panes.set(name, `conversation: ${hist.join(" | ")}\nreply-to: ${text}\n> `);
  }
  keys: string[] = [];
  sendKey(name: string, key: string) {
    this.keys.push(`${name}:${key}`);
  }
  capture(name: string) {
    return this.panes.get(name) ?? "";
  }
  kill(name: string) {
    this.panes.delete(name);
    this.history.delete(name);
  }
  has(name: string) {
    return this.panes.has(name);
  }
}

// Instant, deterministic settle: no real time passes.
const fastWait = { settleMs: 0, maxMs: 100, sleep: async () => {} };
const noSleep = async () => {};

let dir: string;
let backend: FakeBackend;

/** open helper: instant prime (no real boot wait), fixed id. */
const open = (agent: string, id?: string) =>
  openSession({ backend, dataDir: dir, agent, idGen: id ? () => id : undefined, startupMs: 0, sleep: noSleep });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "vanta-agent-session-"));
  backend = new FakeBackend();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("openSession", () => {
  it("starts the agent's launch command, primes it, and persists the session", async () => {
    const r = await open("claude", "ag-test1");
    expect(r).toMatchObject({ id: "ag-test1", agent: "claude", backendName: "vanta-ag-test1" });
    expect(backend.panes.has("vanta-ag-test1")).toBe(true);
    expect(backend.keys).toContain("vanta-ag-test1:Escape"); // primed to clear startup modal
    expect(listSessions(dir).map((s) => s.id)).toContain("ag-test1");
  });
  it("opens a VISIBLE terminal window (injected) when show:true, named for the session", async () => {
    const opened: string[] = [];
    const r = await openSession({ backend, dataDir: dir, agent: "claude", idGen: () => "vis1", startupMs: 0, sleep: noSleep, show: true, openTerminal: (n) => { opened.push(n); return { ok: true }; } });
    expect(r).toMatchObject({ id: "vis1", backendName: "vanta-vis1" });
    expect(opened).toEqual(["vanta-vis1"]); // the watch-window targets this session
  });
  it("does NOT open a terminal window when show is unset (back-compat)", async () => {
    const opened: string[] = [];
    await openSession({ backend, dataDir: dir, agent: "claude", idGen: () => "vis2", startupMs: 0, sleep: noSleep, openTerminal: (n) => { opened.push(n); return { ok: true }; } });
    expect(opened).toEqual([]);
  });

  it("rejects an unknown agent", async () => {
    const r = await open("nope");
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toContain("unknown agent");
  });
  it("errors when the backend is unavailable", async () => {
    backend.isAvailable = false;
    const r = await open("claude");
    expect((r as { error: string }).error).toContain("tmux is not available");
  });
});

describe("sendToSession (turn-by-turn context)", () => {
  it("carries context across 3 dependent sends and returns each reply", async () => {
    const s = (await open("claude", "ag-ctx")) as { id: string };
    const r1 = await sendToSession({ backend, dataDir: dir, id: s.id, text: "remember 42", wait: fastWait });
    const r2 = await sendToSession({ backend, dataDir: dir, id: s.id, text: "and remember blue", wait: fastWait });
    const r3 = await sendToSession({ backend, dataDir: dir, id: s.id, text: "what did I say?", wait: fastWait });
    expect((r1 as { reply: string }).reply).toContain("remember 42");
    // the 3rd reply reflects the whole conversation (context carried by the session)
    const reply3 = (r3 as { reply: string }).reply;
    expect(reply3).toContain("remember 42");
    expect(reply3).toContain("remember blue");
    expect(reply3).toContain("reply-to: what did I say?");
  });
  it("errors on an unknown session id", async () => {
    const r = await sendToSession({ backend, dataDir: dir, id: "ag-missing", text: "hi", wait: fastWait });
    expect((r as { error: string }).error).toContain("no agent session");
  });
  it("errors when the session has died", async () => {
    const s = (await open("claude", "ag-dead")) as { id: string };
    backend.kill("vanta-ag-dead");
    const r = await sendToSession({ backend, dataDir: dir, id: s.id, text: "hi", wait: fastWait });
    expect((r as { error: string }).error).toContain("no longer running");
  });
});

describe("readSession / closeSession", () => {
  it("reads the current pane without sending", async () => {
    const s = (await open("codex", "ag-read")) as { id: string };
    const r = readSession({ backend, dataDir: dir, id: s.id });
    expect((r as { text: string }).text).toContain("codex ready");
  });
  it("closes a session: kills the backend and drops it from the registry", async () => {
    const s = (await open("claude", "ag-close")) as { id: string };
    const r = closeSession({ backend, dataDir: dir, id: s.id });
    expect(r).toEqual({ ok: true });
    expect(backend.has("vanta-ag-close")).toBe(false);
    expect(listSessions(dir)).toHaveLength(0);
  });
});

describe("knownInteractiveAgents", () => {
  it("lists the supported agent CLIs", () => {
    expect(knownInteractiveAgents()).toEqual(["claude", "codex", "cursor-agent", "gemini", "opencode"]);
  });
});
