import { describe, expect, it } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  approvedMkdirWritableDirs,
  directMkdirTargets,
  externalDirectMkdirTargets,
  resolvedMkdirSafetySuffix,
} from "./shell-mkdir-scope.js";

describe("direct mkdir sandbox scope", () => {
  const root = "/work/vanta";
  const env = { HOME: "/Users/tester" } as NodeJS.ProcessEnv;

  it("resolves every quoted HOME target in the failed setup command", () => {
    const command = 'mkdir -p "$HOME/.local/firecrawl-tools" "$HOME/.codex/skills"';
    expect(directMkdirTargets(command, root, env)).toEqual([
      "/Users/tester/.local/firecrawl-tools",
      "/Users/tester/.codex/skills",
    ]);
    expect(resolvedMkdirSafetySuffix(command, root)).toContain("resolved mkdir targets");
  });

  it("keeps all external targets and excludes an in-project target", () => {
    const command = "mkdir -p './inside' '/srv/one' '/srv/two'";
    expect(externalDirectMkdirTargets(command, root, root)).toEqual(["/srv/one", "/srv/two"]);
  });

  it("returns each distinct existing parent needed for a one-run grant", () => {
    const command = "mkdir -p '/tmp/vanta-one/new' '/private/tmp/vanta-two/new'";
    const parents = approvedMkdirWritableDirs(command, root);
    expect(parents.length).toBeGreaterThan(0);
    expect(new Set(parents).size).toBe(parents.length);
  });

  it("rejects command substitution, malformed quotes, and protected targets", () => {
    expect(directMkdirTargets('mkdir -p "$HOME/safe/$(touch /tmp/pwn)"', root, env)).toEqual([]);
    expect(directMkdirTargets("mkdir -p '/tmp/unclosed", root, env)).toEqual([]);
    expect(directMkdirTargets('mkdir -p "$HOME/.ssh/new-key"', root)).toEqual([]);
    expect(directMkdirTargets(`mkdir -p '${join(homedir(), ".codex/auth.json")}'`, root)).toEqual([]);
  });

  it("does not interpret HOME inside single quotes", () => {
    expect(directMkdirTargets("mkdir -p '$HOME/literal'", root, env)).toEqual([
      join(root, "$HOME/literal"),
    ]);
  });
});
