import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveSession, loadSession, listSessions, newSessionId, forkSession } from "./store.js";
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
});
