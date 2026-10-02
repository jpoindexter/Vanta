import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantAlways, grantNever } from "./grant.js";
import { loadRules, saveRules } from "./store.js";
import { matchRule, tighten } from "./rules.js";

describe("permission grant helpers", () => {
  let env: NodeJS.ProcessEnv;
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-perm-grant-"));
    env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("persists tool-scoped allow and deny rules", async () => {
    await grantAlways("shell_cmd", env);
    await grantNever("write_file", env);
    expect(await loadRules(env)).toEqual([
      { action: "allow", tool: "shell_cmd" },
      { action: "deny", tool: "write_file" },
    ]);
  });

  it("no-ops without a tool name", async () => {
    await grantAlways(undefined, env);
    await grantNever(undefined, env);
    expect(await loadRules(env)).toEqual([]);
  });

  it("replaces an older tool-wide ask so don't-ask-again survives a fresh load", async () => {
    await saveRules([{ action: "ask", tool: "browser_read" }], env);
    await grantAlways("browser_read", env);
    const reloaded = await loadRules({ VANTA_HOME: home });
    expect(matchRule(reloaded, "browser_read", "read public page")).toBe("allow");
    expect(reloaded).toEqual([{ action: "allow", tool: "browser_read" }]);
  });

  it("allows changing the same tool preference without accumulating shadowed rules", async () => {
    await grantAlways("browser_read", env);
    await grantNever("browser_read", env);
    expect(matchRule(await loadRules(env), "browser_read", "read page")).toBe("deny");
    await grantAlways("browser_read", env);
    await grantAlways("browser_read", env);
    expect(await loadRules(env)).toEqual([{ action: "allow", tool: "browser_read" }]);
  });

  it("retains narrower restrictions, unrelated tools and the kernel block", async () => {
    const narrower = { action: "deny" as const, tool: "browser_read", pattern: "private.example" };
    const unrelated = { action: "ask" as const, tool: "shell_cmd" };
    await saveRules([narrower, unrelated, { action: "ask", tool: "browser_read" }], env);
    await grantAlways("browser_read", env);
    const rules = await loadRules(env);
    expect(rules).toContainEqual(narrower);
    expect(rules).toContainEqual(unrelated);
    expect(tighten("allow", matchRule(rules, "browser_read", "private.example"))).toBe("block");
    expect(tighten("block", matchRule(rules, "browser_read", "public.example"))).toBe("block");
  });
});
