import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executionContext } from "./execution-context.js";
import type { AgentDeps } from "./agent-types.js";
import type { ToolContext } from "../tools/types.js";
import { grantAlways, grantNever } from "../permissions/grant.js";

const ACTION = "Edit file notes.md";
let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "vanta-exact-choice-"));
  vi.stubEnv("VANTA_HOME", join(base, "state"));
  vi.stubEnv("VANTA_PERMISSION_MODE", "default");
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(base, { recursive: true, force: true }); });

function ask(root: string) {
  const prompt = vi.fn(async () => false);
  const deps = { registry: { get: () => ({ describeForSafety: () => ACTION }) } } as unknown as AgentDeps;
  const ctx = { root, requestApproval: prompt } as unknown as ToolContext;
  const call = { id: "c1", name: "edit_file", arguments: {} };
  return { prompt, request: () => executionContext(call, deps, ctx).requestApproval(ACTION, "routine", "edit_file", undefined) };
}

describe("an inner approval consults rules saved for this project", () => {
  it("applies a project-scoped Always to the inner approval without prompting", async () => {
    await grantAlways("edit_file", process.env, join(base, "a"));
    const { prompt, request } = ask(join(base, "a"));
    expect(await request()).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
  });

  it("does not apply another project's Always, and asks instead", async () => {
    await grantAlways("edit_file", process.env, join(base, "a"));
    const { prompt, request } = ask(join(base, "b"));
    expect(await request()).toBe(false);
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("applies a project-scoped Never to the inner approval without prompting", async () => {
    await grantNever("edit_file", process.env, join(base, "a"));
    const { prompt, request } = ask(join(base, "a"));
    expect(await request()).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
  });
});
