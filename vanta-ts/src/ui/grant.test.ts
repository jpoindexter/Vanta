import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantAlways } from "./grant.js";
import { loadRules } from "../permissions/store.js";

describe("grantAlways — persist an allow rule from the approval prompt", () => {
  let env: NodeJS.ProcessEnv;
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-grant-"));
    env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("writes a tool-scoped allow rule the dispatch gate can read back", async () => {
    await grantAlways("read_file", env);
    expect(await loadRules(env)).toEqual([{ action: "allow", tool: "read_file" }]);
  });

  it("no-ops without a tool name (nothing persisted)", async () => {
    await grantAlways(undefined, env);
    expect(await loadRules(env)).toEqual([]);
  });
});
