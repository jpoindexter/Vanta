import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildMigrationPlan, formatPlan, numberedItems, parseItemSelection, filterPlanByNumbers, narrowByFootprint, type PlanDeps } from "./plan.js";

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

function memoryDeps(root: string, dirs: string[], files: Record<string, string>): PlanDeps {
  const path = (...parts: string[]): string => [root, ...parts].join("/");
  return {
    sourceRoot: root,
    exists: (p) => p === root,
    readText: (p) => files[p] ?? null,
    listDirs: (p) => (p === path("skills") ? dirs : []),
    existingSkillNames: new Set(),
    existingMcpNames: new Set(),
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
    expect(plan.gaps).toContainEqual({ footprint: "source", item: "/no/such/openclaw", reason: "source store not found" });
  });
});

describe("honest could-not-migrate report", () => {
  it("keeps malformed source items visible instead of silently dropping them", () => {
    const root = "/tmp/.openclaw";
    const plan = buildMigrationPlan(
      "openclaw",
      memoryDeps(root, ["usable", "empty", "missing"], {
        [`${root}/skills/usable/SKILL.md`]: "---\nname: usable\n---\n\nbody",
        [`${root}/skills/empty/SKILL.md`]: "---\nname: empty\n---\n\n",
        [`${root}/config.json`]: "{ nope",
      }),
    );

    expect(plan.skills.map((s) => s.name)).toEqual(["usable"]);
    expect(plan.gaps).toContainEqual({ footprint: "skill", item: "empty", reason: "invalid skill markdown or empty body" });
    expect(plan.gaps).toContainEqual({ footprint: "skill", item: "missing", reason: "missing SKILL.md or <slug>.md" });
    expect(plan.gaps).toContainEqual({ footprint: "config", item: "config.json", reason: "invalid JSON; skipped MCP/model parsing for this file" });
    expect(formatPlan(plan)).toMatch(/Could not migrate \/ needs manual review/);
  });

  it("names unsupported adoption footprints so imports do not imply parity", () => {
    const plan = buildMigrationPlan("hermes", fsDeps(fixture("hermes")));
    expect(plan.gaps.map((g) => g.footprint)).toEqual(expect.arrayContaining(["memory", "persona", "allowlist", "workspace"]));
    expect(formatPlan(plan)).toMatch(/workspace\/session state is not portable/);
  });
});

describe("formatPlan never leaks a secret", () => {
  it("redacts and never prints the github token value", () => {
    const out = formatPlan(buildMigrationPlan("openclaw", fsDeps(fixture("openclaw"))));
    expect(out).not.toContain("<github-token-here>"); // env values never reach the preview
    expect(out).toMatch(/secrets: GITHUB_TOKEN → redacted/);
  });
});

describe("per-item selection", () => {
  const plan = buildMigrationPlan("openclaw", fsDeps(fixture("openclaw")));

  it("numbers skills, then MCP servers, then model", () => {
    const items = numberedItems(plan);
    expect(items.map((i) => i.kind)).toEqual(["skill", "skill", "mcp", "mcp", "model"]);
    expect(items[0]).toMatchObject({ n: 1, kind: "skill" });
  });

  it("parseItemSelection handles all / none / lists / ranges and drops out-of-range", () => {
    expect(parseItemSelection("all", 5)).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(parseItemSelection("", 3)).toEqual(new Set([1, 2, 3]));
    expect(parseItemSelection("none", 5)).toEqual(new Set());
    expect(parseItemSelection("1,3", 5)).toEqual(new Set([1, 3]));
    expect(parseItemSelection("2-4", 5)).toEqual(new Set([2, 3, 4]));
    expect(parseItemSelection("1, 9, 2", 5)).toEqual(new Set([1, 2])); // 9 dropped
  });

  it("filterPlanByNumbers keeps only the chosen items", () => {
    const items = numberedItems(plan); // [1,2]=skills (sorted), [3,4]=mcp (json order), [5]=model
    const filtered = filterPlanByNumbers(plan, items, new Set([1, 3]));
    expect(filtered.skills.map((s) => s.name)).toEqual(["debug-flaky-test"]);
    expect(filtered.mcpServers.map((m) => m.name)).toEqual(["github"]); // item 3 = first mcp (json insertion order)
    expect(filtered.modelConfig).toBeNull(); // 5 not selected
  });

  it("narrowByFootprint drops whole footprints", () => {
    const onlySkills = narrowByFootprint(plan, { skills: true, mcp: false, model: false });
    expect(onlySkills.skills.length).toBe(2);
    expect(onlySkills.mcpServers).toEqual([]);
    expect(onlySkills.modelConfig).toBeNull();
  });
});
