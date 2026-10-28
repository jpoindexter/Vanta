import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decide } from "./approval-prompt.js";
import { TaskApprovalScope, requestApprovalWithTaskScope, type Pending } from "./task-approval.js";
import { loadRules } from "../permissions/store.js";
import { matchRule } from "../permissions/rules.js";

let base: string;
let project: string;
let other: string;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "vanta-tui-scope-"));
  project = join(base, "project"); other = join(base, "other");
  await Promise.all([mkdir(project), mkdir(other)]);
  vi.stubEnv("VANTA_HOME", join(base, "home"));
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(base, { recursive: true, force: true }); });

/** Ask through the real TUI request path, then answer it with the real decision handler. */
async function answer(root: string, outcome: "always" | "never"): Promise<boolean> {
  let pending: Pending | null = null;
  const result = requestApprovalWithTaskScope({
    taskApprovals: new TaskApprovalScope(), setPending: (next) => { pending = typeof next === "function" ? next(pending) : next; },
    action: "read public page", reason: "review", toolName: "browser_read", root,
  });
  await decide(pending!, outcome);
  return result;
}

describe("terminal Always/Never choices", () => {
  it("save a rule for this project that a later process still reads", async () => {
    await expect(answer(project, "always")).resolves.toBe(true);
    const rules = await loadRules({ VANTA_HOME: join(base, "home") } as NodeJS.ProcessEnv);
    expect(matchRule(rules, "browser_read", "read public page", project)).toBe("allow");
    expect(matchRule(rules, "browser_read", "read public page", other)).toBeNull();
  });

  it("save a Never for this project only", async () => {
    await expect(answer(project, "never")).resolves.toBe(false);
    const rules = await loadRules(process.env);
    expect(matchRule(rules, "browser_read", "read public page", project)).toBe("deny");
    expect(matchRule(rules, "browser_read", "read public page", other)).toBeNull();
  });

  it("refuse to save a rule for a fresh-approval request", async () => {
    const pending: Pending = { action: "send", reason: "once", toolName: "gmail_send", fresh: true, root: project, resolve: vi.fn() };
    await decide(pending, "always");
    expect(pending.resolve).toHaveBeenCalledExactlyOnceWith(false);
    expect(await loadRules(process.env)).toEqual([]);
  });
});
