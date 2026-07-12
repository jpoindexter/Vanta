import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  saveSession,
  loadSession,
  checkpointSessionMessages,
  listSessions,
  newSessionId,
  forkSession,
  createFsSessionStore,
  type Session,
  type SessionMeta,
  type SessionStore,
} from "./store.js";
import type { Message } from "../types.js";

const TRANSCRIPT: Message[] = [
  { role: "system", content: "you are vanta" },
  { role: "user", content: "summarize the readme" },
  { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read_file", arguments: { path: "README.md" } }] },
  { role: "tool", toolCallId: "c1", name: "read_file", content: "# Vanta\n..." },
  { role: "assistant", content: "Vanta is a trusted operator agent." },
];

describe("session store", () => {
  let home: string;
  const prev = process.env.VANTA_HOME;
  const env = () => ({ VANTA_HOME: home }) as NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-sessions-"));
  });
  afterEach(async () => {
    if (prev === undefined) delete process.env.VANTA_HOME;
    else process.env.VANTA_HOME = prev;
    await rm(home, { recursive: true, force: true });
  });

  it("round-trips a session and derives a title from the first user message", async () => {
    await saveSession("20260602-120000", TRANSCRIPT, { env: env() });
    const loaded = await loadSession("20260602-120000", env());
    expect(loaded).not.toBeNull();
    expect(loaded?.messages).toHaveLength(5);
    expect(loaded?.title).toBe("summarize the readme");
  });

  it("returns null for a missing session", async () => {
    expect(await loadSession("nope", env())).toBeNull();
  });

  it("lists sessions newest-first with a turn count", async () => {
    await saveSession("20260601-090000", TRANSCRIPT, { env: env(), now: "2026-06-01T09:00:00.000Z" });
    await saveSession("20260602-090000", TRANSCRIPT, { env: env(), now: "2026-06-02T09:00:00.000Z" });
    const list = await listSessions(env());
    expect(list.map((s) => s.id)).toEqual(["20260602-090000", "20260601-090000"]);
    expect(list[0]?.turns).toBe(1); // one user message
  });

  it("returns [] when no sessions dir exists", async () => {
    expect(await listSessions(env())).toEqual([]);
  });

  it("generates a sortable timestamp id", () => {
    const id = newSessionId(new Date("2026-06-02T14:30:52.000Z"));
    expect(id).toMatch(/^\d{8}-\d{6}$/);
  });

  it("records projectId on save and exposes it on the listing", async () => {
    await saveSession("20260620-120000", TRANSCRIPT, { env: env(), projectId: "abc123def456" });
    const loaded = await loadSession("20260620-120000", env());
    expect(loaded?.projectId).toBe("abc123def456");
    const list = await listSessions(env());
    expect(list[0]?.projectId).toBe("abc123def456");
  });

  it("omits projectId when not provided (existing sessions still load)", async () => {
    await saveSession("20260620-130000", TRANSCRIPT, { env: env() });
    const loaded = await loadSession("20260620-130000", env());
    expect(loaded).not.toBeNull();
    expect(loaded?.projectId).toBeUndefined();
    const raw = JSON.parse(
      await readFile(join(home, "sessions", "20260620-130000.json"), "utf8"),
    ) as Record<string, unknown>;
    expect("projectId" in raw).toBe(false); // byte-identical to pre-feature sessions
    const list = await listSessions(env());
    expect(list[0]?.projectId).toBeUndefined();
  });

  it("forks a session into a new id without changing the original", async () => {
    await saveSession("20260602-120000", TRANSCRIPT, { env: env(), now: "2026-06-02T12:00:00.000Z" });
    const fork = await forkSession("20260602-120000", { env: env(), now: new Date(2026, 5, 3, 12, 0, 0) });
    const original = await loadSession("20260602-120000", env());
    expect(fork?.id).toBe("20260603-120000");
    expect(fork?.messages).toEqual(TRANSCRIPT);
    expect(original?.updated).toBe("2026-06-02T12:00:00.000Z");
    expect((await listSessions(env())).map((s) => s.id)).toEqual(["20260603-120000", "20260602-120000"]);
  });

  it("recovers a started mutating call as unknown and persists the repair", async () => {
    const interrupted: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "publish it" },
      { role: "assistant", content: "", toolCalls: [{ id: "mutate-1", name: "publish_release", arguments: { token: "secret" }, effectState: "started" }] },
    ];
    await saveSession("interrupted", interrupted, { env: env() });

    const loaded = await loadSession("interrupted", env());
    const result = loaded?.messages.at(-1);
    expect(result).toMatchObject({
      role: "tool",
      toolCallId: "mutate-1",
      effectDisposition: "unknown",
    });
    expect(result?.content).toMatch(/inspect current state before any retry/i);

    const raw = JSON.parse(
      await readFile(join(home, "sessions", "interrupted.json"), "utf8"),
    ) as Session;
    expect(raw.messages.at(-1)).toEqual(result);
  });

  it("does not reconcile a pending call during a live checkpoint", async () => {
    const pending: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "publish it" },
      { role: "assistant", content: "", toolCalls: [{ id: "mutate-2", name: "publish_release", arguments: {}, effectState: "pending" }] },
    ];
    await saveSession("live", pending, { env: env(), title: "preserved title" });
    const started = structuredClone(pending);
    const assistant = started.at(-1);
    if (assistant?.role === "assistant" && assistant.toolCalls?.[0]) {
      assistant.toolCalls[0].effectState = "started";
    }

    await checkpointSessionMessages("live", started, env());

    const raw = JSON.parse(
      await readFile(join(home, "sessions", "live.json"), "utf8"),
    ) as Session;
    expect(raw.title).toBe("preserved title");
    expect(raw.messages).toEqual(started);
    expect(raw.messages.some((message) => message.role === "tool")).toBe(false);
  });
});

// PORT-SESSION-STORE: persistence goes through a SessionStore interface; the fs-JSON
// impl is the default adapter and an alternate store replaces it without caller edits.
describe("SessionStore port (PORT-SESSION-STORE)", () => {
  let home: string;
  const prev = process.env.VANTA_HOME;
  beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "vanta-store-port-")); });
  afterEach(async () => {
    if (prev === undefined) delete process.env.VANTA_HOME;
    else process.env.VANTA_HOME = prev;
    await rm(home, { recursive: true, force: true });
  });

  it("the default fs adapter round-trips save → load → list → delete", async () => {
    const store = createFsSessionStore({ VANTA_HOME: home } as NodeJS.ProcessEnv);
    await store.save("s1", TRANSCRIPT, { now: "2026-07-03T00:00:00.000Z" });
    expect((await store.load("s1"))?.messages).toEqual(TRANSCRIPT);
    expect((await store.list()).map((m) => m.id)).toEqual(["s1"]);
    await store.delete("s1");
    expect(await store.load("s1")).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  // An alternate (in-memory) adapter — proves the interface is the real seam: a
  // store-agnostic consumer runs against it with no knowledge of the backend.
  function inMemoryStore(): SessionStore {
    const db = new Map<string, Session>();
    return {
      async save(id, messages, opts = {}) {
        const now = opts.now ?? "2026-07-03T00:00:00.000Z";
        db.set(id, { id, title: opts.title ?? "mem", started: opts.started ?? now, updated: now, messages });
      },
      async load(id) { return db.get(id) ?? null; },
      async list() {
        const metas: SessionMeta[] = [...db.values()].map((s) => ({
          id: s.id, title: s.title, started: s.started, updated: s.updated,
          projectId: s.projectId, turns: s.messages.filter((m) => m.role === "user").length,
        }));
        return metas.sort((a, b) => b.updated.localeCompare(a.updated));
      },
      async delete(id) { db.delete(id); },
    };
  }

  // The consumer is written against SessionStore only — swapping fs↔memory needs no edit here.
  async function saveThenCount(store: SessionStore, id: string): Promise<number> {
    await store.save(id, TRANSCRIPT);
    return (await store.list()).find((m) => m.id === id)?.turns ?? -1;
  }

  it("an in-memory adapter satisfies the same interface and consumer", async () => {
    const mem = inMemoryStore();
    expect(await saveThenCount(mem, "m1")).toBe(1); // one user message in TRANSCRIPT
    expect((await mem.load("m1"))?.messages).toEqual(TRANSCRIPT);
  });

  it("the same consumer runs unchanged against the fs adapter", async () => {
    const fs = createFsSessionStore({ VANTA_HOME: home } as NodeJS.ProcessEnv);
    expect(await saveThenCount(fs, "f1")).toBe(1);
  });
});
