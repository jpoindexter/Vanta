import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildMigrationPlan, formatPlan, type PlanDeps } from "./plan.js";
import { applyMigration, type ApplyDeps } from "./apply.js";

const fixtureRoot = fileURLToPath(new URL("./__fixtures__/hermes-yaml", import.meta.url));

function fsDeps(root: string): PlanDeps {
  return {
    sourceRoot: root,
    exists: (p) => existsSync(p),
    readText: (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } },
    listDirs: (p) => { try { return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } },
    existingSkillNames: new Set(),
    existingMcpNames: new Set(),
  };
}

describe("buildMigrationPlan — hermes config.yaml", () => {
  const plan = buildMigrationPlan("hermes", fsDeps(fixtureRoot));

  it("brings MCP servers and the default model from config.yaml", () => {
    expect(plan.mcpServers.map((m) => m.name).sort()).toEqual(["filesystem", "github", "globby", "linear", "remote_api"]);
    expect(plan.modelConfig).toEqual({ provider: "anthropic", model: "claude-opus-4.6" });
    expect(plan.notes).toContain("config: config.yaml");
  });

  it("lists every skipped field as a config gap, prefixed with the file", () => {
    const items = plan.gaps.filter((g) => g.footprint === "config").map((g) => g.item);
    expect(items).toContain("config.yaml: mcp_servers.filesystem.timeout");
    expect(items).toContain("config.yaml: mcp_servers.github.env.SLACK_BOT_TOKEN");
    expect(items).toContain("config.yaml: model.api_key");
  });

  it("does not flag `${VAR}` references as secrets and never prints a literal credential", () => {
    expect(plan.mcpServers.find((m) => m.name === "github")?.secretKeys).toEqual([]);
    const preview = formatPlan(plan);
    expect(preview).toContain("Could not migrate / needs manual review");
    expect(preview).toContain("config.yaml: mcp_servers.remote_api.headers.Authorization");
    expect(preview).not.toMatch(/literal-value-in-file|not-a-real-token|not-a-real-key/);
  });

  it("prefers config.yaml over a JSON probe, and falls back to JSON when the yaml has no servers", () => {
    const files: Record<string, string> = {
      "/h/config.yaml": "display:\n  theme: dark\n",
      "/h/hermes.json": JSON.stringify({ provider: "openai", defaultModel: "gpt-4o", mcpServers: { slack: { command: "node" } } }),
    };
    const deps: PlanDeps = { sourceRoot: "/h", exists: (p) => p === "/h", readText: (p) => files[p] ?? null, listDirs: () => [], existingSkillNames: new Set(), existingMcpNames: new Set() };
    const fallback = buildMigrationPlan("hermes", deps);
    expect(fallback.mcpServers.map((m) => m.name)).toEqual(["slack"]);
    files["/h/config.yaml"] = "mcp_servers:\n  other:\n    command: node\n";
    expect(buildMigrationPlan("hermes", deps).mcpServers.map((m) => m.name)).toEqual(["other"]);
  });

  it("is hermes-only: an openclaw store never reads config.yaml", () => {
    const files: Record<string, string> = { "/o/config.yaml": "mcp_servers:\n  x:\n    command: node\n" };
    const deps: PlanDeps = { sourceRoot: "/o", exists: () => true, readText: (p) => files[p] ?? null, listDirs: () => [], existingSkillNames: new Set(), existingMcpNames: new Set() };
    expect(buildMigrationPlan("openclaw", deps).mcpServers).toEqual([]);
  });
});

describe("applyMigration — yaml-sourced servers", () => {
  it("writes only reference-form env and no trust or secret material into mcp.json", async () => {
    const plan = buildMigrationPlan("hermes", fsDeps(fixtureRoot));
    let mcpJson = "";
    let envFile = "";
    const deps: ApplyDeps = {
      env: {}, backup: async () => "backup.tgz", writeSkill: async () => { throw new Error("no skills expected"); },
      readMcpJson: async () => null, writeMcpJson: async (t) => { mcpJson = t; },
      readStoreEnv: async () => "", writeStoreEnv: async (t) => { envFile = t; },
    };
    const result = await applyMigration(plan, { skills: false, mcp: true, model: true, overwrite: false }, deps);
    expect(result.mcpAdded.sort()).toEqual(["filesystem", "github", "globby", "linear", "remote_api"]);
    const written = JSON.parse(mcpJson) as { servers: Record<string, Record<string, unknown>> };
    expect(written.servers.github?.env).toEqual({ GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}", LOG_LEVEL: "info", SLACK_BOT_TOKEN: "${SLACK_BOT_TOKEN}" });
    expect(mcpJson).not.toMatch(/literal-value-in-file|not-a-real-token|trust/i);
    expect(envFile).toContain("VANTA_PROVIDER=anthropic");
    expect(envFile).toContain("VANTA_MODEL=claude-opus-4.6");
  });
});
