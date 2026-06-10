import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseRules,
  serializeRules,
  loadRules,
  addRule,
  removeRule,
} from "./store.js";
import type { PermRule } from "./rules.js";

describe("parseRules / serializeRules", () => {
  it("round-trips bare, tool-only, pattern-only, and full rules deep-equal", () => {
    const rules: PermRule[] = [
      { action: "allow" }, // bare
      { action: "deny", tool: "shell_cmd" }, // tool-only
      { action: "ask", pattern: "secret" }, // pattern-only
      { action: "deny", tool: "shell_cmd", pattern: "rm -rf" }, // full
    ];
    expect(parseRules(serializeRules(rules))).toEqual(rules);
  });

  it("omits empty fields as undefined (not empty string)", () => {
    const [rule] = parseRules("deny\tshell_cmd\t");
    expect(rule).toEqual({ action: "deny", tool: "shell_cmd" });
    expect(rule).not.toHaveProperty("pattern");
  });

  it("skips blank lines and unknown actions", () => {
    expect(parseRules("\nallow\tread_file\t\n\nbogus\tx\ty\n")).toEqual([
      { action: "allow", tool: "read_file" },
    ]);
  });
});

describe("store fs ops on a temp VANTA_HOME", () => {
  let env: NodeJS.ProcessEnv;
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-perms-"));
    env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("loadRules on a missing file returns []", async () => {
    expect(await loadRules(env)).toEqual([]);
  });

  it("addRule persists and is read back by loadRules", async () => {
    await addRule({ action: "deny", tool: "shell_cmd", pattern: "rm -rf" }, env);
    await addRule({ action: "allow", tool: "read_file" }, env);
    const loaded = await loadRules(env);
    expect(loaded).toEqual([
      { action: "deny", tool: "shell_cmd", pattern: "rm -rf" },
      { action: "allow", tool: "read_file" },
    ]);
  });

  it("removeRule deletes by 1-based index and returns the removed rule", async () => {
    await addRule({ action: "deny", tool: "a" }, env);
    await addRule({ action: "allow", tool: "b" }, env);
    const removed = await removeRule(1, env);
    expect(removed).toEqual({ action: "deny", tool: "a" });
    expect(await loadRules(env)).toEqual([{ action: "allow", tool: "b" }]);
  });

  it("removeRule out of range returns null and writes nothing", async () => {
    await addRule({ action: "deny", tool: "a" }, env);
    expect(await removeRule(0, env)).toBeNull();
    expect(await removeRule(99, env)).toBeNull();
    expect(await loadRules(env)).toEqual([{ action: "deny", tool: "a" }]);
  });
});
