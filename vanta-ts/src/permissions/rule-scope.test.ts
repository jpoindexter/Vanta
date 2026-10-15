import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { grantAlways, grantNever } from "./grant.js";
import { loadRules, parseRules, saveRules, serializeRules, removeRule } from "./store.js";
import { matchRule } from "./rules.js";

let base: string;
let env: NodeJS.ProcessEnv;
let projectA: string;
let projectB: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "vanta-rule-scope-"));
  env = { VANTA_HOME: join(base, "home") } as NodeJS.ProcessEnv;
  projectA = join(base, "a"); projectB = join(base, "b");
  await Promise.all([mkdir(projectA), mkdir(projectB)]);
});
afterEach(() => rm(base, { recursive: true, force: true }));

describe("project-scoped saved rules", () => {
  it("persist across a fresh load and match only their own project", async () => {
    await grantAlways("shell_cmd", env, projectA);
    const reloaded = await loadRules({ VANTA_HOME: env.VANTA_HOME } as NodeJS.ProcessEnv);
    expect(matchRule(reloaded, "shell_cmd", "run shell command: ls", projectA)).toBe("allow");
    expect(matchRule(reloaded, "shell_cmd", "run shell command: ls", projectB)).toBeNull();
    expect(matchRule(reloaded, "shell_cmd", "run shell command: ls")).toBeNull();
    expect(matchRule(reloaded, "write_file", "write file x", projectA)).toBeNull();
  });

  it("keeps separate rules per project and replaces only the same project's preference", async () => {
    await grantAlways("shell_cmd", env, projectA);
    await grantNever("shell_cmd", env, projectB);
    await grantNever("shell_cmd", env, projectA);
    const rules = await loadRules(env);
    expect(rules).toHaveLength(2);
    expect(matchRule(rules, "shell_cmd", "x", projectA)).toBe("deny");
    expect(matchRule(rules, "shell_cmd", "x", projectB)).toBe("deny");
  });

  it("matches the same folder through a symlink and trailing slash", async () => {
    const link = join(base, "link");
    await symlink(projectA, link);
    await grantAlways("edit_file", env, link);
    const rules = await loadRules(env);
    expect(matchRule(rules, "edit_file", "edit file x", `${projectA}/`)).toBe("allow");
  });

  it("revokes a scoped rule by index and then no longer matches", async () => {
    await grantAlways("edit_file", env, projectA);
    expect((await removeRule(1, env))?.action).toBe("allow");
    expect(matchRule(await loadRules(env), "edit_file", "x", projectA)).toBeNull();
  });

  it("still lets an unscoped rule apply everywhere and a scoped rule outrank it", async () => {
    await saveRules([{ action: "ask", tool: "web_fetch" }], env);
    expect(matchRule(await loadRules(env), "web_fetch", "x", projectB)).toBe("ask");
    await grantAlways("web_fetch", env, projectA);
    const rules = await loadRules(env);
    expect(matchRule(rules, "web_fetch", "x", projectA)).toBe("allow");
    expect(matchRule(rules, "web_fetch", "x", projectB)).toBe("ask");
  });

  it("reads old three-column files and round-trips the scope column", () => {
    expect(parseRules("allow\tshell_cmd\t")).toEqual([{ action: "allow", tool: "shell_cmd" }]);
    const scoped = [{ action: "deny" as const, tool: "shell_cmd", root: "/work/a" }];
    expect(parseRules(serializeRules(scoped))).toEqual(scoped);
  });

  it("does not lose a rule when two choices are saved at the same time", async () => {
    await Promise.all([grantAlways("edit_file", env, projectA), grantAlways("write_file", env, projectA), grantNever("shell_cmd", env, projectB)]);
    expect((await loadRules(env)).map((rule) => rule.tool).sort()).toEqual(["edit_file", "shell_cmd", "write_file"]);
  });

  it("writes one line per rule after repeated saves", async () => {
    await grantAlways("edit_file", env, projectA);
        await grantAlways("write_file", env, projectA);
    expect((await readFile(join(base, "home", "permissions.tsv"), "utf8")).split("\n")).toHaveLength(2);
  });
});
