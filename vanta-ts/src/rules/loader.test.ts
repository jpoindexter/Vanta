import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadRules, rulesTier, globToRegex } from "./loader.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let rulesDir: string;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `vanta-rules-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  rulesDir = join(tmpDir, "rules");
  await mkdir(rulesDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeRule(name: string, content: string): Promise<void> {
  await writeFile(join(rulesDir, name), content, "utf8");
}

// ---------------------------------------------------------------------------
// globToRegex unit tests
// ---------------------------------------------------------------------------

describe("globToRegex()", () => {
  it("matches simple filename patterns", () => {
    expect(globToRegex("*.ts").test("foo.ts")).toBe(true);
    expect(globToRegex("*.ts").test("foo.tsx")).toBe(false);
    expect(globToRegex("*.ts").test("dir/foo.ts")).toBe(false); // * doesn't cross /
  });

  it("matches ** across path separators", () => {
    expect(globToRegex("src/**/*.ts").test("src/foo.ts")).toBe(true);
    expect(globToRegex("src/**/*.ts").test("src/a/b/foo.ts")).toBe(true);
    expect(globToRegex("src/**/*.ts").test("lib/foo.ts")).toBe(false);
  });

  it("matches exact paths", () => {
    expect(globToRegex("src/index.ts").test("src/index.ts")).toBe(true);
    expect(globToRegex("src/index.ts").test("src/other.ts")).toBe(false);
  });

  it("escapes regex special chars in the glob", () => {
    expect(globToRegex("src/foo.ts").test("src/fooXts")).toBe(false); // . is literal
  });
});

// ---------------------------------------------------------------------------
// loadRules tests
// ---------------------------------------------------------------------------

describe("loadRules()", () => {
  it("returns [] when the rules directory does not exist", async () => {
    // tmpDir exists but has no rules/ subdir — remove it to test missing dir.
    await rm(rulesDir, { recursive: true, force: true });
    const rules = await loadRules(tmpDir);
    expect(rules).toEqual([]);
  });

  it("returns [] when the rules directory is empty", async () => {
    const rules = await loadRules(tmpDir);
    expect(rules).toEqual([]);
  });

  it("loads a rule without frontmatter as always-on", async () => {
    await writeRule("always.md", "Always follow these rules.");
    const rules = await loadRules(tmpDir);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.content).toBe("Always follow these rules.");
    expect(rules[0]!.paths).toBeUndefined();
  });

  it("loads a rule with paths: frontmatter as path-scoped", async () => {
    const content = [
      "---",
      "paths: [src/**/*.ts, lib/**/*.ts]",
      "---",
      "TypeScript style rules.",
    ].join("\n");
    await writeRule("ts-rules.md", content);
    const rules = await loadRules(tmpDir);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.paths).toEqual(["src/**/*.ts", "lib/**/*.ts"]);
    expect(rules[0]!.content).toBe("TypeScript style rules.");
  });

  it("loads multiple files, sorting them alphabetically", async () => {
    await writeRule("z-last.md", "Z rule");
    await writeRule("a-first.md", "A rule");
    const rules = await loadRules(tmpDir);
    expect(rules).toHaveLength(2);
    expect(rules[0]!.content).toBe("A rule");
    expect(rules[1]!.content).toBe("Z rule");
  });

  it("ignores non-.md files in the rules directory", async () => {
    await writeRule("rule.md", "A real rule.");
    await writeFile(join(rulesDir, "config.json"), '{"ignored": true}', "utf8");
    const rules = await loadRules(tmpDir);
    expect(rules).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// rulesTier tests
// ---------------------------------------------------------------------------

describe("rulesTier()", () => {
  it("returns empty string for no rules", () => {
    expect(rulesTier([])).toBe("");
  });

  it("includes always-on rules regardless of active files", () => {
    const rules = [{ path: "/a.md", content: "Rule A" }];
    const tier = rulesTier(rules);
    expect(tier).toContain("Rule A");
    expect(tier).toContain("Project rules:");
  });

  it("includes always-on rules even with no activeFiles argument", () => {
    const rules = [{ path: "/a.md", content: "Always-on content" }];
    const tier = rulesTier(rules, undefined);
    expect(tier).toContain("Always-on content");
  });

  it("includes path-scoped rule when an active file matches", () => {
    const rules = [
      { path: "/ts.md", content: "TS rules", paths: ["src/**/*.ts"] },
    ];
    const tier = rulesTier(rules, ["src/foo/bar.ts"]);
    expect(tier).toContain("TS rules");
  });

  it("excludes path-scoped rule when no active file matches", () => {
    const rules = [
      { path: "/ts.md", content: "TS rules", paths: ["src/**/*.ts"] },
    ];
    const tier = rulesTier(rules, ["lib/index.js"]);
    expect(tier).toBe("");
  });

  it("excludes path-scoped rule when activeFiles is empty", () => {
    const rules = [
      { path: "/ts.md", content: "TS rules", paths: ["src/**/*.ts"] },
    ];
    const tier = rulesTier(rules, []);
    expect(tier).toBe("");
  });

  it("mixes always-on and path-scoped rules correctly", () => {
    const rules = [
      { path: "/global.md", content: "Global rule" },
      { path: "/ts.md", content: "TS rule", paths: ["src/**/*.ts"] },
      { path: "/css.md", content: "CSS rule", paths: ["**/*.css"] },
    ];
    // Only src file active — ts rule included, css rule excluded.
    const tier = rulesTier(rules, ["src/index.ts"]);
    expect(tier).toContain("Global rule");
    expect(tier).toContain("TS rule");
    expect(tier).not.toContain("CSS rule");
  });

  it("returns empty string when all rules are path-scoped and none match", () => {
    const rules = [
      { path: "/ts.md", content: "TS", paths: ["**/*.ts"] },
    ];
    const tier = rulesTier(rules, ["src/main.py"]);
    expect(tier).toBe("");
  });
});
