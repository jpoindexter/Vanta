import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantAlways, grantNever } from "./grant.js";
import { loadRules } from "./store.js";

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
});
