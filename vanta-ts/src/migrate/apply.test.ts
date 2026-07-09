import { describe, it, expect } from "vitest";
import { applyMigration, mergeMcpServers, modelEnvUpdates, type ApplyDeps } from "./apply.js";
import type { MigrationPlan, SkillItem, McpItem } from "./plan.js";
import type { ParsedSkill } from "./parse.js";

const ps = (name: string): ParsedSkill => ({ name, description: `d ${name}`, body: "body", tags: [] });
const skillItem = (name: string, conflict = false): SkillItem => ({ name, description: `d ${name}`, skill: ps(name), conflict });
const mcpItem = (name: string, conflict = false): McpItem => ({ name, server: { command: "npx" }, conflict, secretKeys: [] });

const plan = (over: Partial<MigrationPlan> = {}): MigrationPlan => ({
  source: "openclaw",
  sourceRoot: "/x/.openclaw",
  found: true,
  skills: [],
  mcpServers: [],
  modelConfig: null,
  notes: [],
  gaps: [],
  ...over,
});

function deps(): { d: ApplyDeps; written: string[]; mcpJson: { v: string | null }; envText: { v: string } } {
  const written: string[] = [];
  const mcpJson = { v: null as string | null };
  const envText = { v: "" };
  const d: ApplyDeps = {
    env: {} as NodeJS.ProcessEnv,
    backup: async () => "/tmp/backup.tgz",
    writeSkill: (async (input: { name: string }) => {
      written.push(input.name);
      return { skill: { meta: {}, body: "" }, path: "" };
    }) as unknown as ApplyDeps["writeSkill"],
    readMcpJson: async () => mcpJson.v,
    writeMcpJson: async (t) => {
      mcpJson.v = t;
    },
    readStoreEnv: async () => envText.v,
    writeStoreEnv: async (t) => {
      envText.v = t;
    },
  };
  return { d, written, mcpJson, envText };
}

describe("mergeMcpServers", () => {
  it("adds incoming servers and keeps existing ones (servers/mcpServers both honored)", () => {
    const merged = mergeMcpServers(JSON.stringify({ mcpServers: { a: { command: "x" } } }), { b: { url: "http://y" } });
    const parsed = JSON.parse(merged);
    expect(Object.keys(parsed.servers).sort()).toEqual(["a", "b"]);
  });
  it("starts fresh from null/garbage existing", () => {
    expect(Object.keys(JSON.parse(mergeMcpServers(null, { a: { command: "x" } })).servers)).toEqual(["a"]);
    expect(Object.keys(JSON.parse(mergeMcpServers("{bad", { a: { command: "x" } })).servers)).toEqual(["a"]);
  });
});

describe("modelEnvUpdates", () => {
  it("maps provider/model onto Vanta env keys, lowercasing the provider", () => {
    expect(modelEnvUpdates({ provider: "Anthropic", model: "claude-sonnet-4-6" })).toEqual({ VANTA_PROVIDER: "anthropic", VANTA_MODEL: "claude-sonnet-4-6" });
  });
});

describe("applyMigration", () => {
  it("backs up first, then writes selected skills/mcp/model", async () => {
    const { d, written, mcpJson, envText } = deps();
    const res = await applyMigration(
      plan({ skills: [skillItem("a")], mcpServers: [mcpItem("gh")], modelConfig: { provider: "openai", model: "gpt-4o" } }),
      { skills: true, mcp: true, model: true, overwrite: false },
      d,
    );
    expect(res.backup).toBe("/tmp/backup.tgz");
    expect(written).toEqual(["a"]);
    expect(JSON.parse(mcpJson.v!).servers.gh).toBeTruthy();
    expect(envText.v).toMatch(/VANTA_PROVIDER=openai/);
    expect(res.modelApplied).toBe(true);
  });

  it("skips conflicts unless --overwrite", async () => {
    const { d, written } = deps();
    const res = await applyMigration(plan({ skills: [skillItem("dup", true)] }), { skills: true, mcp: false, model: false, overwrite: false }, d);
    expect(written).toEqual([]);
    expect(res.skipped.some((s) => /dup/.test(s))).toBe(true);

    const { d: d2, written: written2 } = deps();
    await applyMigration(plan({ skills: [skillItem("dup", true)] }), { skills: true, mcp: false, model: false, overwrite: true }, d2);
    expect(written2).toEqual(["dup"]);
  });

  it("honors footprint selection (model-only writes nothing else)", async () => {
    const { d, written, mcpJson } = deps();
    await applyMigration(
      plan({ skills: [skillItem("a")], mcpServers: [mcpItem("gh")], modelConfig: { provider: "x" } }),
      { skills: false, mcp: false, model: true, overwrite: false },
      d,
    );
    expect(written).toEqual([]);
    expect(mcpJson.v).toBeNull();
  });
});
