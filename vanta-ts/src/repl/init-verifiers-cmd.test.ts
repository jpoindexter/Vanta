import { describe, expect, it } from "vitest";
import { parseSkill } from "../skills/frontmatter.js";
import {
  buildVerifierSkill,
  detectVerifierCommands,
  runInitVerifiers,
  verifierSkills,
  type FileReader,
  type Verifier,
} from "./init-verifiers-cmd.js";

const NOW = "2026-06-21T00:00:00.000Z";

describe("detectVerifierCommands", () => {
  it("maps package.json scripts to test/build/lint/typecheck verifiers", () => {
    const packageJson = JSON.stringify({
      scripts: { test: "vitest run", build: "tsc -b", lint: "eslint .", typecheck: "tsc --noEmit" },
    });
    const v = detectVerifierCommands({ packageJson });
    expect(v).toEqual([
      { name: "verify-test", command: "npm run test", kind: "test" },
      { name: "verify-build", command: "npm run build", kind: "build" },
      { name: "verify-lint", command: "npm run lint", kind: "lint" },
      { name: "verify-typecheck", command: "npm run typecheck", kind: "typecheck" },
    ]);
  });

  it("only emits scripts that actually exist", () => {
    const packageJson = JSON.stringify({ scripts: { test: "vitest run" } });
    const v = detectVerifierCommands({ packageJson });
    expect(v).toEqual([{ name: "verify-test", command: "npm run test", kind: "test" }]);
  });

  it("derives cargo test + cargo build from a Cargo.toml", () => {
    const v = detectVerifierCommands({ cargoToml: "[package]\nname = \"x\"\n" });
    expect(v).toEqual([
      { name: "verify-test", command: "cargo test", kind: "test" },
      { name: "verify-build", command: "cargo build", kind: "build" },
    ]);
  });

  it("derives make test / make build from a Makefile's targets", () => {
    const makefile = "test:\n\tvitest run\n\nbuild:\n\ttsc\n";
    const v = detectVerifierCommands({ makefile });
    expect(v).toEqual([
      { name: "verify-test", command: "make test", kind: "test" },
      { name: "verify-build", command: "make build", kind: "build" },
    ]);
  });

  it("ignores a Makefile with no test/build target", () => {
    expect(detectVerifierCommands({ makefile: "deploy:\n\trsync\n" })).toEqual([]);
  });

  it("is tolerant of a garbage package.json (skips it, does not throw)", () => {
    expect(detectVerifierCommands({ packageJson: "{ not json " })).toEqual([]);
  });

  it("tolerates a package.json with a non-object scripts field", () => {
    expect(detectVerifierCommands({ packageJson: JSON.stringify({ scripts: "nope" }) })).toEqual([]);
  });

  it("de-duplicates by kind — package.json wins over Cargo/Makefile for the same kind", () => {
    const packageJson = JSON.stringify({ scripts: { test: "vitest run" } });
    const v = detectVerifierCommands({ packageJson, cargoToml: "[package]\n", makefile: "build:\n\ttsc\n" });
    expect(v).toEqual([
      { name: "verify-test", command: "npm run test", kind: "test" },
      { name: "verify-build", command: "cargo build", kind: "build" },
    ]);
  });

  it("returns [] when no project files are provided", () => {
    expect(detectVerifierCommands({})).toEqual([]);
  });

  it("only emits commands derived from the project's own config (no synthesized shell)", () => {
    const v = detectVerifierCommands({ packageJson: JSON.stringify({ scripts: { test: "vitest run" } }) });
    for (const cmd of v) expect(cmd.command).toBe("npm run test");
  });
});

describe("buildVerifierSkill", () => {
  const verifier: Verifier = { name: "verify-test", command: "npm run test", kind: "test" };

  it("produces valid frontmatter named verify-<kind>", () => {
    const md = buildVerifierSkill(verifier, NOW);
    const skill = parseSkill(md);
    expect(skill.meta.name).toBe("verify-test");
    expect(skill.meta.created).toBe(NOW);
    expect(skill.meta.tags).toContain("verifier");
    expect(skill.meta.tags).toContain("test");
  });

  it("references the exact command and the exit-0 pass criterion in the body", () => {
    const md = buildVerifierSkill(verifier, NOW);
    const skill = parseSkill(md);
    expect(skill.body).toContain("npm run test");
    expect(skill.body).toContain("exits 0");
  });

  it("round-trips through parseSkill", () => {
    const md = buildVerifierSkill({ name: "verify-build", command: "cargo build", kind: "build" }, NOW);
    const skill = parseSkill(md);
    expect(skill.meta.name).toBe("verify-build");
    expect(skill.body).toContain("cargo build");
  });
});

describe("verifierSkills", () => {
  it("builds one named SKILL.md per command", () => {
    const commands: Verifier[] = [
      { name: "verify-test", command: "npm run test", kind: "test" },
      { name: "verify-build", command: "npm run build", kind: "build" },
    ];
    const skills = verifierSkills(commands, NOW);
    expect(skills.map((s) => s.name)).toEqual(["verify-test", "verify-build"]);
    expect(skills[0]!.content).toContain("npm run test");
    expect(skills[1]!.content).toContain("npm run build");
  });

  it("returns [] for no commands", () => {
    expect(verifierSkills([])).toEqual([]);
  });
});

describe("runInitVerifiers", () => {
  const reader = (files: Record<string, string>): FileReader => async (path) => {
    const key = Object.keys(files).find((k) => path.endsWith(k));
    return key ? files[key] : undefined;
  };

  it("summarizes the verifiers it would create from detected project files", async () => {
    const read = reader({ "package.json": JSON.stringify({ scripts: { test: "vitest run", build: "tsc" } }) });
    const { output } = await runInitVerifiers("/proj", read);
    expect(output).toContain("2 verifier skill(s)");
    expect(output).toContain("verify-test");
    expect(output).toContain("npm run test");
    expect(output).toContain("write_skill");
  });

  it("emits a generic verifier note when no commands are detected", async () => {
    const { output } = await runInitVerifiers("/proj", async () => undefined);
    expect(output).toContain("no build/test/lint/typecheck command detected");
    expect(output).toContain("generic verifier");
  });

  it("does not write any SKILL.md (the write is delegated to write_skill)", async () => {
    let wrote = false;
    const read: FileReader = async (path) => {
      if (path.endsWith("Cargo.toml")) return "[package]\n";
      return undefined;
    };
    const { output } = await runInitVerifiers("/proj", read);
    expect(wrote).toBe(false); // handler never touches the skill store
    expect(output).toContain("cargo test");
  });
});
