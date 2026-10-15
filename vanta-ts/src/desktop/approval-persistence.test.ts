import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestWebApproval } from "./approval.js";
import { createDesktopServer, type DesktopState } from "./server.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("approval HTTP route with real rule storage", () => {
  it("preserves exact tool and fresh-approval details through the options boundary", async () => {
    const state: DesktopState = { root: "/tmp" };
    const detail = { diff: "fixture diff", fresh: true };
    const answer = requestWebApproval(state, "fixture", "review", { toolName: "write_file", detail });
    expect(state.pendingApproval).toMatchObject({ action: "fixture", reason: "review", toolName: "write_file", detail });
    state.pendingApproval!.resolve(false);
    await expect(answer).resolves.toBe(false);
  });

  it.each(["always", "never"] as const)("fails closed on a real %s write error", async (decision) => {
    const root = await mkdtemp(join(tmpdir(), "vanta-approval-storage-"));
    roots.push(root);
    vi.stubEnv("VANTA_HOME", root);
    // A directory at the rule filename deterministically fails even when tests run as root.
    await mkdir(join(root, "permissions.tsv"));
    const state: DesktopState = { root, currentRunEvents: [] };
    const result = requestWebApproval(state, "example", "needs approval", "shell_cmd");
    const id = state.pendingApproval!.id;
    const token = "a".repeat(64);
    const server = createDesktopServer(root, { sessions: new Map([["default", state]]), boundaryToken: token });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("server did not bind");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/approval`, {
        method: "POST", headers: { "content-type": "application/json", "x-vanta-desktop-boundary": token },
        body: JSON.stringify({ id, decision }),
      });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Could not save the approval rule. The action was not approved." });
      await expect(result).resolves.toBe(false);
      expect(state.pendingApproval).toBeUndefined();
      expect(state.currentRunEvents).toMatchObject([{ ok: false, approval: { decision: "deny" } }]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it.each(["always", "never"] as const)("persists %s before releasing the action", async (decision) => {
    const root = await mkdtemp(join(tmpdir(), "vanta-approval-storage-"));
    roots.push(root);
    vi.stubEnv("VANTA_HOME", root);
    const { resolveApproval } = await import("./approval.js");
    const resolve = vi.fn();
    await resolveApproval({ id: "one", action: "example", reason: "approval", toolName: "shell_cmd", resolve }, decision);
    expect(await readFile(join(root, "permissions.tsv"), "utf8")).toBe(`${decision === "always" ? "allow" : "deny"}\tshell_cmd\t`);
    expect(resolve).toHaveBeenCalledExactlyOnceWith(decision === "always");
  });
});
