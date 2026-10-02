import { Readable } from "node:stream";
import type http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { grantAlways, grantNever } from "../permissions/grant.js";
import { resolveApproval, type PendingApproval } from "./approval.js";
import { handleApproval, type DesktopState } from "./handlers.js";

vi.mock("../permissions/grant.js", () => ({ grantAlways: vi.fn(), grantNever: vi.fn() }));
afterEach(() => vi.resetAllMocks());

function pending(toolName: string | undefined = "shell_cmd"): PendingApproval {
  return { id: "approval-1", action: "run shell command: example", reason: "needs approval", toolName, resolve: vi.fn() };
}

async function submit(state: DesktopState, decision: string) {
  const req = Readable.from([JSON.stringify({ id: "approval-1", decision })]) as unknown as http.IncomingMessage;
  req.method = "POST";
  let status = 0;
  let body = "";
  const res = { writeHead(code: number) { status = code; }, end(value: string) { body = value; } } as unknown as http.ServerResponse;
  await handleApproval(state, req, res);
  return { status, body: JSON.parse(body) };
}

describe("desktop approval persistence", () => {
  it.each(["always", "never"] as const)("rejects forged %s for a fresh one-time request", async (decision) => {
    const p = { ...pending(), detail: { fresh: true } };
    await expect(resolveApproval(p, decision)).rejects.toThrow("one-time approval");
    expect(grantAlways).not.toHaveBeenCalled();
    expect(grantNever).not.toHaveBeenCalled();
    expect(p.resolve).not.toHaveBeenCalled();
  });
  it.each(["allow", "deny"] as const)("keeps %s one-time", async (decision) => {
    const p = pending();
    await resolveApproval(p, decision);
    expect(p.resolve).toHaveBeenCalledExactlyOnceWith(decision === "allow");
    expect(grantAlways).not.toHaveBeenCalled();
    expect(grantNever).not.toHaveBeenCalled();
  });

  it.each(["always", "never"] as const)("waits for %s persistence before resolving", async (decision) => {
    const p = pending();
    const grant = vi.mocked(decision === "always" ? grantAlways : grantNever);
    let finish!: () => void;
    grant.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const operation = resolveApproval(p, decision);
    expect(grant).toHaveBeenCalledExactlyOnceWith("shell_cmd");
    expect(p.resolve).not.toHaveBeenCalled();
    finish();
    await operation;
    expect(p.resolve).toHaveBeenCalledExactlyOnceWith(decision === "always");
  });

  it.each(["always", "never"] as const)("reports %s storage failure without resolving success", async (decision) => {
    vi.mocked(decision === "always" ? grantAlways : grantNever).mockRejectedValueOnce(new Error("private storage path"));
    const p = pending();
    await expect(resolveApproval(p, decision)).rejects.toThrow("Could not save the approval rule");
    expect(p.resolve).not.toHaveBeenCalled();
  });

  it.each(["always", "never"] as const)("rejects unscoped %s instead of claiming it saved", async (decision) => {
    const p = pending();
    delete p.toolName;
    await expect(resolveApproval(p, decision)).rejects.toThrow("without a tool name");
    expect(p.resolve).not.toHaveBeenCalled();
    expect(grantAlways).not.toHaveBeenCalled();
    expect(grantNever).not.toHaveBeenCalled();
  });

  it.each(["always", "never"] as const)("returns an error and releases the blocked action as denied when %s fails", async (decision) => {
    vi.mocked(decision === "always" ? grantAlways : grantNever).mockRejectedValueOnce(new Error("private storage path"));
    const p = pending();
    const state: DesktopState = { root: "/tmp", pendingApproval: p, currentRunEvents: [] };
    const result = await submit(state, decision);
    expect(result.status).toBe(500);
    expect(result.body.error).toContain("Could not save the approval rule");
    expect(result.body.error).not.toContain("private storage path");
    expect(p.resolve).toHaveBeenCalledExactlyOnceWith(false);
    expect(state.pendingApproval).toBeUndefined();
    expect(state.currentRunEvents).toMatchObject([{ ok: false, approval: { decision: "deny" } }]);
    expect((await submit(state, decision)).status).toBe(404);
    expect(p.resolve).toHaveBeenCalledTimes(1);
  });

  it("rejects a duplicate submission while the rule is still saving", async () => {
    let finish!: () => void;
    vi.mocked(grantAlways).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const p = pending();
    const state: DesktopState = { root: "/tmp", pendingApproval: p, currentRunEvents: [] };
    const first = submit(state, "always");
    await vi.waitFor(() => expect(grantAlways).toHaveBeenCalledTimes(1));
    expect((await submit(state, "allow")).status).toBe(404);
    expect(p.resolve).not.toHaveBeenCalled();
    finish();
    expect((await first).status).toBe(200);
    expect(p.resolve).toHaveBeenCalledExactlyOnceWith(true);
    expect(state.currentRunEvents).toHaveLength(1);
  });

  it.each(["allow", "always", "deny", "never"] as const)("records %s on success", async (decision) => {
    const p = pending();
    const state: DesktopState = { root: "/tmp", pendingApproval: p, currentRunEvents: [] };
    expect(await submit(state, decision)).toEqual({ status: 200, body: { ok: true } });
    expect(state.currentRunEvents).toMatchObject([{ approval: { decision } }]);
    expect(p.resolve).toHaveBeenCalledExactlyOnceWith(decision === "allow" || decision === "always");
  });
});
