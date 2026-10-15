import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultOperatorProfile, writeOperatorProfile } from "../operator-profile/profile.js";
import { grantAlways } from "../permissions/grant.js";
import { buildPermissionRequest } from "../permissions/request.js";
import type { ToolContext } from "../tools/types.js";
import type { ToolCall } from "../types.js";
import type { AgentDeps } from "./agent-types.js";
import { applySafetyGate } from "./dispatch-safety.js";

let home: string;
const call: ToolCall = { id: "profile-proof", name: "browser_read", arguments: { url: "https://example.test" } };
const policyReason = "Your saved operator profile requires approval every time for this tool. Allow once or change that preference separately.";

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-profile-approval-"));
  vi.stubEnv("VANTA_HOME", home);
  vi.stubEnv("VANTA_AUTO_MODE", "0");
  vi.stubEnv("VANTA_AUTO_CLASSIFIER", "0");
  vi.stubEnv("VANTA_BASH_CLASSIFIER", "0");
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(home, { recursive: true, force: true }); });

function fixture(risk: "allow" | "ask" | "block" = "ask", mode: "default" | "fullAccess" = "default") {
  const requestApproval = vi.fn<AgentDeps["requestApproval"]>(async () => true);
  const safety = { assess: async () => ({ risk, reason: "fixture kernel" }), proposeApproval: async () => "id",
    approve: async () => {}, deny: async () => {}, logEvent: async () => {} };
  const deps = { root: home, requestApproval, safety,
    registry: { get: () => ({ describeForSafety: () => "read public page" }) } } as unknown as AgentDeps;
  const ctx = { root: home, safety: deps.safety, requestApproval, permissionMode: () => mode } as ToolContext;
  return { deps, ctx, requestApproval };
}

describe("operator profile approval eligibility", () => {
  it.each([false, true])("explains explicit always_ask with remembered allow=%s without rewriting profile", async (saved) => {
    await writeOperatorProfile({ ...defaultOperatorProfile(), approvalPreferences: { browser_read: "always_ask" } });
    const before = await readFile(join(home, "operator-profile.json"), "utf8");
    if (saved) await grantAlways("browser_read");
    const { deps, ctx, requestApproval } = fixture();
    for (const id of ["first-task", "later-task"]) {
      expect((await applySafetyGate({ ...call, id }, deps, ctx)).approved).toBe(true);
    }
    expect(requestApproval).toHaveBeenCalledTimes(2);
    expect(requestApproval).toHaveBeenLastCalledWith("read public page", policyReason, "browser_read", { canRemember: false });
    const [action, reason, toolName, detail] = requestApproval.mock.calls[0]!;
    expect(buildPermissionRequest({ action, reason, toolName, detail }).canRemember).toBe(false);
    expect(await readFile(join(home, "operator-profile.json"), "utf8")).toBe(before);
  });

  it("honors wildcard always_ask and an explicit non-asking tool preference", async () => {
    await writeOperatorProfile({ ...defaultOperatorProfile(), approvalPreferences: { "*": "always_ask" } });
    await grantAlways("browser_read");
    const { deps, ctx, requestApproval } = fixture();
    await applySafetyGate(call, deps, ctx);
    expect(requestApproval).toHaveBeenCalledWith("read public page", policyReason, "browser_read", { canRemember: false });
    requestApproval.mockClear();
    await writeOperatorProfile({ ...defaultOperatorProfile(), approvalPreferences: { "*": "always_ask", browser_read: "ask_only_one_way" } });
    expect((await applySafetyGate(call, deps, ctx)).approved).toBe(true);
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("preserves ordinary remembered rules, Full access, and kernel blocks", async () => {
    await grantAlways("browser_read");
    const ordinary = fixture();
    expect((await applySafetyGate(call, ordinary.deps, ordinary.ctx)).approved).toBe(true);
    expect(ordinary.requestApproval).not.toHaveBeenCalled();
    await writeOperatorProfile({ ...defaultOperatorProfile(), approvalPreferences: { browser_read: "always_ask" } });
    const full = fixture("ask", "fullAccess");
    expect((await applySafetyGate(call, full.deps, full.ctx)).approved).toBe(true);
    expect(full.requestApproval).not.toHaveBeenCalled();
    const blocked = fixture("block", "fullAccess");
    expect((await applySafetyGate(call, blocked.deps, blocked.ctx)).approved).toBe(false);
    expect(blocked.requestApproval).not.toHaveBeenCalled();
  });
});
