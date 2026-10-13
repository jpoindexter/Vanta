import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestWebApproval, resolveApproval } from "./approval.js";
import { loadRules } from "../permissions/store.js";
import { matchRule } from "../permissions/rules.js";

let base: string;
let projectA: string;
let projectB: string;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "vanta-desktop-scope-"));
  projectA = join(base, "a"); projectB = join(base, "b");
  await Promise.all([mkdir(projectA), mkdir(projectB)]);
  vi.stubEnv("VANTA_HOME", join(base, "home"));
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(base, { recursive: true, force: true }); });

async function choose(root: string, decision: "always" | "never", detail?: { fresh?: boolean }): Promise<boolean> {
  const host = { root } as Parameters<typeof requestWebApproval>[0];
  const answer = requestWebApproval(host, "run shell command: ls", "routine", { toolName: "shell_cmd", detail });
  await resolveApproval(host.pendingApproval!, decision);
  return answer;
}

describe("Desktop Always/Never choices", () => {
  it("persist for the session's project and survive a new session in the same project", async () => {
    await expect(choose(projectA, "always")).resolves.toBe(true);
    const rules = await loadRules(process.env);
    expect(matchRule(rules, "shell_cmd", "run shell command: ls", projectA)).toBe("allow");
    expect(matchRule(rules, "shell_cmd", "run shell command: ls", projectB)).toBeNull();
  });

  it("keep a Never scoped to its project", async () => {
    await expect(choose(projectA, "never")).resolves.toBe(false);
    const rules = await loadRules(process.env);
    expect(matchRule(rules, "shell_cmd", "run shell command: ls", projectA)).toBe("deny");
    expect(matchRule(rules, "shell_cmd", "run shell command: ls", projectB)).toBeNull();
  });

  it("do not save a rule for a fresh-approval request", async () => {
    await expect(choose(projectA, "always", { fresh: true })).rejects.toThrow("requires one-time approval");
    expect(await loadRules(process.env)).toEqual([]);
  });
});
