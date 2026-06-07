import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, utimes, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  shouldAutoHandoff,
  resolveAutoHandoffThreshold,
  writeAutoHandoff,
  readAutoHandoff,
  clearAutoHandoff,
  maybeAutoHandoff,
  autoHandoffPath,
  DEFAULT_AUTOHANDOFF_THRESHOLD,
} from "./auto-handoff.js";
import type { Message } from "../types.js";

describe("shouldAutoHandoff", () => {
  it("fires at/above the threshold, stays quiet below", () => {
    expect(shouldAutoHandoff(76, 100, 0.75)).toBe(true);
    expect(shouldAutoHandoff(74, 100, 0.75)).toBe(false);
  });
  it("is safe with a zero/empty context", () => {
    expect(shouldAutoHandoff(100, 0)).toBe(false);
    expect(shouldAutoHandoff(0, 100)).toBe(false);
  });
});

describe("resolveAutoHandoffThreshold", () => {
  it("defaults and clamps to (0,1]", () => {
    expect(resolveAutoHandoffThreshold({})).toBe(DEFAULT_AUTOHANDOFF_THRESHOLD);
    expect(resolveAutoHandoffThreshold({ VANTA_AUTOHANDOFF_THRESHOLD: "0.6" })).toBe(0.6);
    expect(resolveAutoHandoffThreshold({ VANTA_AUTOHANDOFF_THRESHOLD: "9" })).toBe(DEFAULT_AUTOHANDOFF_THRESHOLD);
  });
});

async function tempDataDir(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), "vanta-ah-")), ".vanta");
  await mkdir(dir, { recursive: true });
  return dir;
}

describe("write / read / clear roundtrip", () => {
  it("writes then reads a recent block, and refuses a stale one", async () => {
    const dir = await tempDataDir();
    await writeAutoHandoff(dir, "RESUME BLOCK");
    expect(await readAutoHandoff(dir)).toContain("RESUME BLOCK");

    // Backdate the file → older than maxAge → not returned.
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await utimes(autoHandoffPath(dir), old, old);
    expect(await readAutoHandoff(dir)).toBeNull();
  });

  it("clear removes the block", async () => {
    const dir = await tempDataDir();
    await writeAutoHandoff(dir, "X");
    await clearAutoHandoff(dir);
    expect(await readAutoHandoff(dir)).toBeNull();
  });

  it("readAutoHandoff returns null when absent", async () => {
    expect(await readAutoHandoff(await tempDataDir())).toBeNull();
  });
});

describe("maybeAutoHandoff", () => {
  const messages: Message[] = [
    { role: "user", content: "do the thing" },
    { role: "assistant", content: "did it" },
  ];
  const safety = { getGoals: async () => [{ id: 1, text: "ship", status: "active" as const }] };

  it("writes a packet when over threshold", async () => {
    const dir = await tempDataDir();
    const repoRoot = join(dir, "..");
    const r = await maybeAutoHandoff({
      estTokens: 90, contextWindow: 100, messages, sessionId: "S1",
      provider: "ollama", model: "qwen", repoRoot, safety, now: new Date(), env: {},
    });
    expect(r.wrote).toBe(true);
    expect(await readFile(autoHandoffPath(dir), "utf8")).toContain("HANDOFF");
  });

  it("does nothing under threshold or when disabled", async () => {
    const repoRoot = join(await tempDataDir(), "..");
    expect((await maybeAutoHandoff({ estTokens: 10, contextWindow: 100, messages, sessionId: "S", provider: "p", model: "m", repoRoot, safety, now: new Date(), env: {} })).wrote).toBe(false);
    expect((await maybeAutoHandoff({ estTokens: 90, contextWindow: 100, messages, sessionId: "S", provider: "p", model: "m", repoRoot, safety, now: new Date(), env: { VANTA_AUTOHANDOFF: "0" } })).wrote).toBe(false);
  });
});
