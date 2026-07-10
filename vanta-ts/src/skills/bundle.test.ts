import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBundleSkillBody, parseBundle, resolveBundle, writeBundle } from "./bundle.js";
import { writeSkill } from "./store.js";

const VALID_BUNDLE = `
name: "dev-workflow"
description: "Complete development workflow"
skills:
  - tdd-cycle
  - code-review
  - writing-plans
instruction: "Apply these workflows when coding"
`;

describe("parseBundle", () => {
  it("parses a valid bundle YAML", () => {
    const cfg = parseBundle(VALID_BUNDLE);
    expect(cfg).not.toBeNull();
    expect(cfg?.name).toBe("dev-workflow");
    expect(cfg?.description).toBe("Complete development workflow");
    expect(cfg?.skills).toEqual(["tdd-cycle", "code-review", "writing-plans"]);
    expect(cfg?.instruction).toBe("Apply these workflows when coding");
  });

  it("handles bundle without instruction", () => {
    const yaml = `name: "quick"\ndescription: "Quick bundle"\nskills:\n  - tdd-cycle\n`;
    const cfg = parseBundle(yaml);
    expect(cfg?.name).toBe("quick");
    expect(cfg?.instruction).toBeUndefined();
  });

  it("returns null for missing required fields", () => {
    expect(parseBundle("skills:\n  - foo\n")).toBeNull();
    expect(parseBundle("name: x\n")).toBeNull();
  });

  it("parses skills list with single quotes", () => {
    const yaml = `name: "x"\ndescription: "y"\nskills:\n  - 'tdd-cycle'\n  - 'code-review'\n`;
    const cfg = parseBundle(yaml);
    expect(cfg?.skills).toEqual(["tdd-cycle", "code-review"]);
  });

  it("returns empty skills list when no skills are listed", () => {
    const yaml = `name: "x"\ndescription: "y"\nskills:\n`;
    const cfg = parseBundle(yaml);
    expect(cfg?.skills).toEqual([]);
  });
});

describe("resolveBundle", () => {
  it("resolves a bundle to a composed skill body", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-bundle-"));
    const env = { VANTA_HOME: home };
    try {
      await writeSkill({ name: "tdd-cycle", description: "d", body: "write failing test" }, { env, now: "2026-01-01T00:00:00.000Z" });
      await writeSkill({ name: "code-review", description: "d", body: "review the diff" }, { env, now: "2026-01-01T00:00:00.000Z" });
      await writeBundle({ name: "dev-workflow", description: "Dev bundle", skills: ["tdd-cycle", "code-review"], instruction: "Use both skills." }, env);
      const bundle = await resolveBundle("dev-workflow", env);
      expect(bundle?.missing).toEqual([]);
      expect(bundle?.body).toContain("# Bundle: dev-workflow");
      expect(bundle?.body).toContain("Use both skills.");
      expect(bundle?.body).toContain("## Skill: tdd-cycle");
      expect(bundle?.body).toContain("review the diff");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("reports missing skills in the composed body", () => {
    const cfg = { name: "x", description: "d", skills: ["missing"] };
    expect(buildBundleSkillBody(cfg, [], ["missing"])).toContain("## Missing Skills\n- missing");
  });
});
