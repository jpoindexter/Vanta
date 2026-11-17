import { afterEach, describe, it, expect } from "vitest";
import { mkdtemp, mkdir, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { delegatedRequestForCall, tryDelegatedAutoApprove } from "./delegated-gate.js";
import type { AuthorityGrant, DelegatedAuditRecord } from "../cofounder/authority-model.js";
import type { ToolCall } from "../types.js";

const writeCall = (path: string): ToolCall => ({
  id: "c1",
  name: "write_file",
  arguments: { path, content: "x" },
});

const grant = (scope: string): AuthorityGrant => ({
  id: "owner-mgr",
  delegator: "owner",
  delegate: "mgr",
  class: { kind: "writeScope", scope },
  active: true,
  grantedAt: "2026-07-04T00:00:00.000Z",
});

const NOW = () => new Date("2026-07-04T10:00:00.000Z");
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function targetFixture() {
  const root = await mkdtemp(join(tmpdir(), "vanta-delegated-target-"));
  roots.push(root);
  const inside = join(root, "approved"), outside = join(root, "other");
  await mkdir(inside); await mkdir(outside);
  await symlink(outside, join(inside, "escape"));
  await symlink(inside, join(root, "alias"));
  return { root, inside, outside };
}

describe("delegatedRequestForCall", () => {
  it("extracts the write path from a write_file call as an ask request", () => {
    expect(delegatedRequestForCall(writeCall("/proj/a.ts"), "write /proj/a.ts", "/proj")).toEqual({
      risk: "ask",
      action: "write /proj/a.ts",
      writePath: "/proj/a.ts",
    });
  });

  it("leaves writePath undefined for a non-write tool", () => {
    const call: ToolCall = { id: "c", name: "shell_cmd", arguments: { command: "ls" } };
    expect(delegatedRequestForCall(call, "run ls", "/proj").writePath).toBeUndefined();
  });
});

describe("tryDelegatedAutoApprove", () => {
  function deps(grants: AuthorityGrant[]) {
    const audit: DelegatedAuditRecord[] = [];
    return {
      root: "/proj",
      audit,
      readGrants: async () => grants,
      appendAudit: async (r: DelegatedAuditRecord) => void audit.push(r),
      now: NOW,
    };
  }

  it("returns null (falls through to prompt) when there are NO grants", async () => {
    const d = deps([]);
    expect(await tryDelegatedAutoApprove(writeCall("/proj/a.ts"), "write /proj/a.ts", d)).toBeNull();
    expect(d.audit).toEqual([]);
  });

  it("auto-approves + audits a write inside an active grant's scope", async () => {
    const d = deps([grant("/proj")]);
    const r = await tryDelegatedAutoApprove(writeCall("/proj/sub/a.ts"), "write /proj/sub/a.ts", d);
    expect(r).toEqual({ grantId: "owner-mgr", writePath: "/proj/sub/a.ts", grantFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(d.audit).toHaveLength(1);
    expect(d.audit[0]).toMatchObject({ delegator: "owner", delegate: "mgr", grantId: "owner-mgr" });
  });

  it("does NOT auto-approve a write OUTSIDE the granted scope", async () => {
    const d = deps([grant("/proj")]);
    expect(await tryDelegatedAutoApprove(writeCall("/etc/passwd"), "write /etc/passwd", d)).toBeNull();
    expect(d.audit).toEqual([]);
  });

  it("does NOT auto-approve when the grant is revoked/inactive", async () => {
    const d = deps([{ ...grant("/proj"), active: false }]);
    expect(await tryDelegatedAutoApprove(writeCall("/proj/a.ts"), "write /proj/a.ts", d)).toBeNull();
  });

  it("degrades to null (prompt) if reading grants throws — never an auto-approve", async () => {
    const d = {
      root: "/proj",
      readGrants: async () => {
        throw new Error("fs down");
      },
      appendAudit: async () => {},
      now: NOW,
    };
    expect(await tryDelegatedAutoApprove(writeCall("/proj/a.ts"), "write /proj/a.ts", d)).toBeNull();
  });

  it("falls through to human approval if the delegated audit cannot be saved", async () => {
    let attempts = 0;
    const d = {
      ...deps([grant("/proj")]),
      appendAudit: async () => {
        attempts++;
        throw new Error("audit unavailable");
      },
    };
    expect(await tryDelegatedAutoApprove(writeCall("/proj/a.ts"), "write /proj/a.ts", d)).toBeNull();
    expect(attempts).toBe(1);
  });

  it("does not delegate an in-scope alias whose resolved target leaves the grant", async () => {
    const f = await targetFixture(), d = { ...deps([grant(f.inside)]), root: f.root };
    expect(await tryDelegatedAutoApprove(writeCall(join(f.inside, "escape/a.txt")), "write alias", d)).toBeNull();
    expect(d.audit).toHaveLength(0);
  });

  it("resolves a relative request from the project, not from the grant", async () => {
    const f = await targetFixture(), d = { ...deps([grant(f.inside)]), root: f.root };
    expect(await tryDelegatedAutoApprove(writeCall("a.txt"), "write relative", d)).toBeNull();
    expect(d.audit).toHaveLength(0);
  });

  it("retains a relative write whose real project target is inside the grant", async () => {
    const f = await targetFixture(), d = { ...deps([grant(f.inside)]), root: f.root };
    expect(await tryDelegatedAutoApprove(writeCall("approved/a.txt"), "write relative", d)).toEqual({ grantId: "owner-mgr", writePath: join(await realpath(f.inside), "a.txt"), grantFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(d.audit).toHaveLength(1);
  });

  it("compares canonical paths when the granted directory is itself an alias", async () => {
    const f = await targetFixture(), d = { ...deps([grant(join(f.root, "alias"))]), root: f.root };
    expect(await tryDelegatedAutoApprove(writeCall(join(f.inside, "a.txt")), "write real target", d)).toEqual({ grantId: "owner-mgr", writePath: join(await realpath(f.inside), "a.txt"), grantFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(d.audit).toHaveLength(1);
  });

  it("requires a new absolute scope instead of reinterpreting a legacy relative grant", async () => {
    const f = await targetFixture(), d = { ...deps([grant("approved")]), root: f.root };
    expect(await tryDelegatedAutoApprove(writeCall("approved/a.txt"), "write relative", d)).toBeNull();
    expect(d.audit).toHaveLength(0);
  });

  it("does not delegate without an absolute project anchor", async () => {
    const d = { ...deps([grant("/proj")]), root: "relative-project" };
    expect(await tryDelegatedAutoApprove(writeCall("a.txt"), "write relative", d)).toBeNull();
    expect(d.audit).toHaveLength(0);
  });
});
