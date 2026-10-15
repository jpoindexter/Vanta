import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { dispatchTool } from "./dispatch-tool.js";
import type { AgentDeps } from "./agent-types.js";
import { editFileTool } from "../tools/edit-file.js";
import { grantAlways, grantNever } from "../permissions/grant.js";
import { applySafetyGate } from "./dispatch-helpers.js";

afterEach(() => vi.unstubAllEnvs());

it("marks the outer replay approval fresh before exposing it to a host", async () => {
  const root = await mkdtemp(join(tmpdir(), "vanta-fresh-outer-"));
  vi.stubEnv("VANTA_HOME", root);
  const requestApproval = vi.fn(async () => false);
  const safety = { assess: async () => ({ risk: "ask", needsHuman: true, reason: "fixture" }), logEvent: vi.fn(), proposeApproval: async () => "id", deny: async () => {} };
  const deps = { root, registry: { get: () => editFileTool }, safety, requestApproval, forceFreshApproval: () => true } as unknown as AgentDeps;
  try {
    await applySafetyGate({ id: "fresh-outer", name: "edit_file", arguments: { path: "brief.md" } }, deps, { root, safety: deps.safety, requestApproval });
    expect(requestApproval).toHaveBeenCalledWith("edit file brief.md", "fixture", "edit_file", { fresh: true });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("remembers an exact routine edit across tasks but preserves fresh replay and explicit denial", async () => {
  const root = await mkdtemp(join(tmpdir(), "vanta-inner-approval-"));
  vi.stubEnv("VANTA_HOME", join(root, "state")); vi.stubEnv("VANTA_PERMISSION_MODE", "default");
  vi.stubEnv("VANTA_OPERATING_MODE", "default"); vi.stubEnv("VANTA_AUTO_MODE", "0");
  const requestApproval = vi.fn(async () => false);
  const safety = { assess: vi.fn(async () => ({ risk: "allow", needsHuman: false, reason: "routine" })), logEvent: vi.fn() };
  const deps = { root, registry: { get: () => editFileTool }, safety, requestApproval } as unknown as AgentDeps;
  const ctx = { root, safety: deps.safety, requestApproval };
  const run = (id: string) => dispatchTool({ id, name: "edit_file", arguments: { path: "brief.md", old_string: "before", new_string: "after" } }, deps, ctx);
  try {
    await writeFile(join(root, "brief.md"), "before");
    expect((await run("initial")).ok).toBe(false);
    expect(requestApproval.mock.calls[0]).toEqual(["Edit file brief.md", "modifying existing file content", "edit_file", { fresh: false }]);
    requestApproval.mockClear(); await grantAlways("edit_file");
    expect((await run("remembered")).ok).toBe(true);
    expect(requestApproval).not.toHaveBeenCalled();
    expect(await readFile(join(root, "brief.md"), "utf8")).toBe("after");
    await writeFile(join(root, "brief.md"), "before"); deps.forceFreshApproval = () => true;
    expect((await run("replay")).ok).toBe(false);
    expect(requestApproval.mock.calls[0]).toEqual(["Edit file brief.md", "modifying existing file content", "edit_file", { fresh: true }]);
    requestApproval.mockClear(); deps.forceFreshApproval = () => false; await grantNever("edit_file");
    expect((await run("denied")).ok).toBe(false); expect(requestApproval).not.toHaveBeenCalled();
    expect(await readFile(join(root, "brief.md"), "utf8")).toBe("before");
  } finally { await rm(root, { recursive: true, force: true }); }
});
