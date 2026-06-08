import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatReproBundle, isSecretKey, maskValue, repro } from "./repro-cmd.js";
import type { Message } from "../types.js";
import type { ReplCtx } from "./types.js";

// ─── pure helpers ─────────────────────────────────────────────────────────────

describe("isSecretKey", () => {
  it("returns true for key-like env var names", () => {
    expect(isSecretKey("OPENAI_API_KEY")).toBe(true);
    expect(isSecretKey("VANTA_TELEGRAM_TOKEN")).toBe(true);
    expect(isSecretKey("GOOGLE_CLIENT_SECRET")).toBe(true);
    expect(isSecretKey("DB_PASSWORD")).toBe(true);
  });

  it("returns false for non-secret names", () => {
    expect(isSecretKey("VANTA_PROVIDER")).toBe(false);
    expect(isSecretKey("VANTA_MODEL")).toBe(false);
    expect(isSecretKey("NODE_ENV")).toBe(false);
  });
});

describe("maskValue", () => {
  it("masks secrets longer than 8 chars", () => {
    const masked = maskValue("OPENAI_API_KEY", "sk-abc1234567890xyz");
    expect(masked).toContain("masked");
    expect(masked).not.toContain("1234567890");
  });

  it("leaves non-secret values unchanged", () => {
    expect(maskValue("VANTA_PROVIDER", "ollama")).toBe("ollama");
  });

  it("hides short secrets entirely", () => {
    expect(maskValue("VANTA_TOKEN", "abc")).toBe("***");
  });
});

// ─── formatReproBundle ────────────────────────────────────────────────────────

describe("formatReproBundle", () => {
  const baseData = {
    when: "2026-06-08T10:00:00Z",
    sessionId: "S1",
    provider: "ollama",
    model: "qwen2.5:14b",
    nodeVersion: "v22.0.0",
    envFlags: ["VANTA_PROVIDER=ollama", "VANTA_MODEL=qwen2.5:14b"],
    goals: [{ id: 1, text: "ship the repro feature", status: "active" as const }],
    tasks: ["[active] implement repro-cmd"],
    lastUserMessages: ["fix the thing"],
    lastAssistantMessages: ["Done."],
    gitStatus: "M src/foo.ts",
    gitLog: "abc1234 fix: something",
  };

  it("returns output containing 'repro'", () => {
    const out = formatReproBundle(baseData);
    expect(out.toLowerCase()).toContain("repro");
  });

  it("includes session id, provider, and model", () => {
    const out = formatReproBundle(baseData);
    expect(out).toContain("S1");
    expect(out).toContain("ollama");
    expect(out).toContain("qwen2.5:14b");
  });

  it("shows active goals", () => {
    const out = formatReproBundle(baseData);
    expect(out).toContain("ship the repro feature");
  });

  it("shows tasks", () => {
    const out = formatReproBundle(baseData);
    expect(out).toContain("implement repro-cmd");
  });

  it("handles empty goals gracefully", () => {
    const out = formatReproBundle({ ...baseData, goals: [] });
    expect(out).toContain("(none)");
  });

  it("handles empty tasks gracefully", () => {
    const out = formatReproBundle({ ...baseData, tasks: [] });
    expect(out).toContain("(none)");
  });
});

// ─── /repro handler ───────────────────────────────────────────────────────────

function makeCtx(dataDir: string): ReplCtx {
  return {
    convo: { messages: [{ role: "user", content: "debug this please" }] as Message[] },
    setup: {
      provider: { modelId: () => "m" },
      safety: { getGoals: async () => [] },
      registry: { schemas: () => [] },
    },
    dataDir,
    state: { sessionId: "S42", turnIndex: 1 },
    env: { VANTA_PROVIDER: "ollama", VANTA_MODEL: "qwen2.5:14b" },
    now: () => new Date("2026-06-08T00:00:00Z"),
  } as unknown as ReplCtx;
}

describe("/repro handler", () => {
  it("returns output containing 'repro' and writes a file", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "vanta-repro-"));
    const dataDir = join(tmp, ".vanta");
    const ctx = makeCtx(dataDir);
    const result = await repro("", ctx);
    expect(result.output).toContain("repro");
    const files = await readdir(dataDir);
    const reproFiles = files.filter((f) => f.startsWith("repro-") && f.endsWith(".md"));
    expect(reproFiles.length).toBe(1);
    const body = await readFile(join(dataDir, reproFiles[0]!), "utf8");
    expect(body).toContain("Vanta Repro Bundle");
  });

  it("handles empty goals and tasks gracefully", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "vanta-repro-empty-"));
    const dataDir = join(tmp, ".vanta");
    const ctx = makeCtx(dataDir);
    // goals empty + no task stack file → should not throw
    const result = await repro("", ctx);
    expect(result.output).toBeDefined();
    const files = await readdir(dataDir);
    const body = await readFile(join(dataDir, files.find((f) => f.startsWith("repro-"))!), "utf8");
    expect(body).toContain("(none)"); // goals and tasks both absent
  });
});
