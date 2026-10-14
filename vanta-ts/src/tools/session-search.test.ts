import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveSession } from "../sessions/store.js";
import { sessionSearchTool, MAX_LIMIT, MAX_QUERY_CHARS } from "./session-search.js";
import { buildRegistry } from "./index.js";
import { toolEffectPolicy } from "../effects/tool-effect-gateway.js";
import type { ToolContext } from "./types.js";

describe("session_search tool", () => {
  let home: string;
  let root: string;
  const ctx = (): ToolContext => ({ root, sessionId: "live", safety: {}, requestApproval: async () => false }) as unknown as ToolContext;
  const run = (args: unknown) => sessionSearchTool.execute(args as Record<string, unknown>, ctx());
  const seed = (id: string, text: string, day = 1) =>
    saveSession(id, [{ role: "user", content: text }, { role: "assistant", content: `ack ${text}` }], { env: { VANTA_HOME: home }, now: `2026-04-${String(day).padStart(2, "0")}T00:00:00Z` });

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-ss-home-"));
    root = await mkdtemp(join(tmpdir(), "vanta-ss-root-"));
    vi.stubEnv("VANTA_HOME", home);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(home, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  });

  it("returns a cited snippet from an earlier session", async () => {
    await seed("20260401-080000", "we chose sqlite for local state");
    const result = await run({ query: "sqlite" });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("hit(s) for \"sqlite\"");
    expect(result.output).toContain("[20260401-080000] 2026-04-01");
    expect(result.output).toContain("untrusted");
  });

  it("says plainly when nothing matches", async () => {
    await seed("s1", "hello there");
    const result = await run({ query: "quokka" });
    expect(result).toMatchObject({ ok: true });
    expect(result.output).toContain('no hits for "quokka"');
    expect(result.output).toContain("searched 1 of 1");
  });

  it("defaults to 5 hits and clamps a large limit to 20", async () => {
    for (let i = 1; i <= 25; i++) await seed(`s${String(i).padStart(2, "0")}`, "migration notes", (i % 28) + 1);
    const lines = (out: string) => out.split("\n").filter((l) => /^\d+\. \[/.test(l));
    expect(lines((await run({ query: "migration" })).output)).toHaveLength(5);
    const big = await run({ query: "migration", limit: 500 });
    expect(lines(big.output)).toHaveLength(MAX_LIMIT);
    expect(big.output).toContain(`limit clamped to ${MAX_LIMIT}`);
    expect(lines((await run({ query: "migration", limit: 0 })).output)).toHaveLength(1);
    expect(lines((await run({ query: "migration", limit: 2.9 })).output)).toHaveLength(2);
  });

  it("keeps every excerpt short even for a huge stored message", async () => {
    await seed("big", `${"padding ".repeat(2000)}the unique-marker decision${" tail".repeat(2000)}`);
    const result = await run({ query: "unique-marker" });
    expect(result.output).toContain("unique-marker");
    const hitLines = result.output.split("\n").filter((l) => /^\d+\. \[/.test(l));
    expect(hitLines.length).toBeGreaterThan(0);
    for (const line of hitLines) expect(line.length).toBeLessThan(400);
    expect(result.output.length).toBeLessThan(1200);
  });

  it.each([
    ["missing query", {}],
    ["empty query", { query: "  " }],
    ["oversized query", { query: "x".repeat(MAX_QUERY_CHARS + 1) }],
    ["non-string query", { query: 42 }],
    ["unknown field", { query: "a", cwd: "/etc" }],
    ["non-numeric limit", { query: "a", limit: "ten" }],
    ["non-object input", "postgres"],
  ])("refuses %s with an actionable error", async (_name, args) => {
    const result = await run(args);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("session_search needs {query:");
    expect(result.output).toContain("Problem:");
  });

  it("keeps the query out of the kernel subject and is classified read-only", () => {
    expect(sessionSearchTool.describeForSafety?.({ query: "rm -rf /" })).not.toContain("rm");
    expect(toolEffectPolicy("session_search")).toBe("read-only");
  });

  it("is registered in the default registry", () => {
    expect(buildRegistry().get("session_search")).toBeDefined();
  });
});
