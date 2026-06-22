import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildMigrationPlan, formatPlan, type PlanDeps } from "./plan.js";

const fixture = (name: string): string => fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));

function fsDeps(root: string, over: Partial<Pick<PlanDeps, "existingSkillNames" | "existingMcpNames">> = {}): PlanDeps {
  return {
    sourceRoot: root,
    exists: (p) => existsSync(p),
    readText: (p) => {
      try {
        return readFileSync(p, "utf8");
      } catch {
        return null;
      }
    },
    listDirs: (p) => {
      try {
        return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
      } catch {
        return [];
      }
    },
    existingSkillNames: over.existingSkillNames ?? new Set(),
    existingMcpNames: over.existingMcpNames ?? new Set(),
  };
}

describe("buildMigrationPlan — openclaw fixture", () => {
  const plan = buildMigrationPlan("openclaw", fsDeps(fixture("openclaw")));

  it("finds both skills, both MCP servers, and the model config", () => {
    expect(plan.found).toBe(true);
    expect(plan.skills.map((s) => s.name)).toEqual(["debug-flaky-test", "write-changelog"]);
    expect(plan.mcpServers.map((m) => m.name).sort()).toEqual(["filesystem", "github"]);
    expect(plan.modelConfig).toMatchObject({ provider: "Anthropic", model: "claude-sonnet-4-6" });
  });

  it("flags the github server's token env as a secret to redact", () => {
    const gh = plan.mcpServers.find((m) => m.name === "github")!;
    expect(gh.secretKeys).toContain("GITHUB_TOKEN");
  });
});

describe("buildMigrationPlan — model config in a separate file (hermes)", () => {
  it("reads provider/model from hermes.json even though it also holds the mcp servers", () => {
    const plan = buildMigrationPlan("hermes", fsDeps(fixture("hermes")));
    expect(plan.skills.map((s) => s.name)).toEqual(["triage-incident"]);
    expect(plan.mcpServers.map((m) => m.name)).toEqual(["slack"]);
    expect(plan.modelConfig).toMatchObject({ provider: "openai", model: "gpt-4o" });
  });
});

describe("conflict detection + absent source", () => {
  it("flags items already present in ~/.vanta", () => {
    const plan = buildMigrationPlan("openclaw", fsDeps(fixture("openclaw"), { existingSkillNames: new Set(["write-changelog"]), existingMcpNames: new Set(["github"]) }));
    expect(plan.skills.find((s) => s.name === "write-changelog")!.conflict).toBe(true);
    expect(plan.mcpServers.find((m) => m.name === "github")!.conflict).toBe(true);
    expect(plan.notes.some((n) => /already exist/.test(n))).toBe(true);
  });

  it("reports found:false when the source store is absent", () => {
    const plan = buildMigrationPlan("openclaw", fsDeps("/no/such/openclaw"));
    expect(plan.found).toBe(false);
    expect(formatPlan(plan)).toMatch(/no openclaw store found/);
  });
});

describe("formatPlan never leaks a secret", () => {
  it("redacts and never prints the github token value", () => {
    const out = formatPlan(buildMigrationPlan("openclaw", fsDeps(fixture("openclaw"))));
    expect(out).not.toContain("<github-token-here>"); // env values never reach the preview
    expect(out).toMatch(/secrets: GITHUB_TOKEN → redacted/);
  });
});
