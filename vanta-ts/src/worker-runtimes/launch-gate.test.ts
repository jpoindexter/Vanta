import { describe, expect, it } from "vitest";
import { authorizeLaunch, launchAction, type GateDeps, type LaunchRequest } from "./launch-gate.js";

const request: LaunchRequest = { runtimeId: "claude-code", displayName: "Claude Code", command: "claude", cwd: "/work/app", ticketId: "T-7", prompt: "Fix the login bug.\nuse key sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA", access: "edit", selfApproving: false };

type Asked = { action: string; reason: string; tool: string; canRemember?: boolean; diff?: string };

function deps(patch: Partial<GateDeps> = {}): { deps: GateDeps; asked: Asked[] } {
  const asked: Asked[] = [];
  return {
    asked,
    deps: {
      assess: async () => ({ risk: "allow" }),
      loadRules: async () => [],
      requestApproval: async (action, reason, tool, detail) => { asked.push({ action, reason, tool, canRemember: detail.canRemember, diff: detail.diff }); return true; },
      projectRoot: "/work/app",
      ...patch,
    },
  };
}

describe("launchAction", () => {
  it("names the CLI, directory, ticket and access, and never carries the secret", () => {
    const action = launchAction(request);
    expect(action).toContain("Claude Code (claude)");
    expect(action).toContain("ticket T-7 in /work/app with edit access");
    expect(action).toContain("Fix the login bug.");
    expect(action).toMatch(/\[prompt sha256:[0-9a-f]{12}\]/);
    expect(action).not.toContain("sk-ant-api03");
  });
});

describe("authorizeLaunch", () => {
  it("asks the owner through the call_agent rule with a redacted prompt preview", async () => {
    const { deps: d, asked } = deps();
    expect(await authorizeLaunch(d, request)).toMatchObject({ ok: true });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ tool: "call_agent", canRemember: undefined });
    expect(asked[0]!.diff).toContain("Fix the login bug");
    expect(asked[0]!.diff).not.toContain("sk-ant-api03");
  });

  it("refuses when the owner declines", async () => {
    const { deps: d } = deps({ requestApproval: async () => false });
    expect(await authorizeLaunch(d, request)).toEqual({ ok: false, error: "the owner declined to launch Claude Code for T-7" });
  });

  it("stops on a kernel block without asking", async () => {
    const { deps: d, asked } = deps({ assess: async () => ({ risk: "block", reason: "exfiltration" }) });
    const out = await authorizeLaunch(d, request);
    expect(out).toMatchObject({ ok: false });
    expect(asked).toHaveLength(0);
  });

  it("fails closed when the kernel is unreachable", async () => {
    const { deps: d, asked } = deps({ assess: async () => { throw new Error("ECONNREFUSED"); } });
    const out = await authorizeLaunch(d, request);
    expect(out).toMatchObject({ ok: false });
    expect(JSON.stringify(out)).toContain("kernel unreachable");
    expect(asked).toHaveLength(0);
  });

  it("skips the card only for a saved project Always rule", async () => {
    const { deps: d, asked } = deps({ loadRules: async () => [{ action: "allow", tool: "call_agent", root: "/work/app" }] });
    expect(await authorizeLaunch(d, request)).toMatchObject({ ok: true });
    expect(asked).toHaveLength(0);
  });

  it("ignores an Always rule saved for another project", async () => {
    const { deps: d, asked } = deps({ loadRules: async () => [{ action: "allow", tool: "call_agent", root: "/work/other" }] });
    await authorizeLaunch(d, request);
    expect(asked).toHaveLength(1);
  });

  it("honours a saved Never rule even when the kernel allows", async () => {
    const { deps: d } = deps({ loadRules: async () => [{ action: "deny", tool: "call_agent", root: "/work/app" }] });
    expect(await authorizeLaunch(d, request)).toMatchObject({ ok: false });
  });

  it("always asks for a self-approving CLI, warns, and withholds Always", async () => {
    const { deps: d, asked } = deps({ loadRules: async () => [{ action: "allow", tool: "call_agent", root: "/work/app" }] });
    await authorizeLaunch(d, { ...request, runtimeId: "hermes", displayName: "Hermes", command: "hermes", selfApproving: true });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ canRemember: false });
    expect(asked[0]!.reason).toContain("approves its own actions");
    expect(asked[0]!.action).toContain("unrestricted");
  });

  it("refuses a needed approval when no approval channel is open", async () => {
    const { deps: d } = deps({ requestApproval: undefined });
    const out = await authorizeLaunch(d, request);
    expect(out).toMatchObject({ ok: false });
    expect(JSON.stringify(out)).toContain("no approval channel");
  });
});
