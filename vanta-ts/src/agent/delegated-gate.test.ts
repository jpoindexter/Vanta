import { describe, it, expect } from "vitest";
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

describe("delegatedRequestForCall", () => {
  it("extracts the write path from a write_file call as an ask request", () => {
    expect(delegatedRequestForCall(writeCall("/proj/a.ts"), "write /proj/a.ts")).toEqual({
      risk: "ask",
      action: "write /proj/a.ts",
      writePath: "/proj/a.ts",
    });
  });

  it("leaves writePath undefined for a non-write tool", () => {
    const call: ToolCall = { id: "c", name: "shell_cmd", arguments: { command: "ls" } };
    expect(delegatedRequestForCall(call, "run ls").writePath).toBeUndefined();
  });
});

describe("tryDelegatedAutoApprove", () => {
  function deps(grants: AuthorityGrant[]) {
    const audit: DelegatedAuditRecord[] = [];
    return {
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
    expect(r).toEqual({ grantId: "owner-mgr" });
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
      readGrants: async () => {
        throw new Error("fs down");
      },
      appendAudit: async () => {},
      now: NOW,
    };
    expect(await tryDelegatedAutoApprove(writeCall("/proj/a.ts"), "write /proj/a.ts", d)).toBeNull();
  });
});
