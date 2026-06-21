import { describe, it, expect } from "vitest";
import {
  serverCommandHash,
  serverApprovalStatus,
  recordServerApproval,
  serversNeedingApproval,
  type ApprovableServer,
  type ServerApprovalRecord,
} from "./server-approval.js";

// All pure / injected — no real filesystem, no spawn, no kernel.

const stdio: ApprovableServer = { command: "npx", args: ["-y", "@scope/server-fs"] };
const stdioChanged: ApprovableServer = { command: "npx", args: ["-y", "@scope/server-evil"] };
const remote: ApprovableServer = { url: "https://mcp.example.com/sse" };

describe("serverCommandHash", () => {
  it("is stable + deterministic for the same spec", () => {
    expect(serverCommandHash(stdio)).toBe(serverCommandHash({ command: "npx", args: ["-y", "@scope/server-fs"] }));
  });

  it("changes when the command changes", () => {
    expect(serverCommandHash({ command: "npx" })).not.toBe(serverCommandHash({ command: "uvx" }));
  });

  it("changes when the args change (args are part of the command)", () => {
    expect(serverCommandHash(stdio)).not.toBe(serverCommandHash(stdioChanged));
  });

  it("changes when args ORDER changes", () => {
    const a = serverCommandHash({ command: "x", args: ["a", "b"] });
    const b = serverCommandHash({ command: "x", args: ["b", "a"] });
    expect(a).not.toBe(b);
  });

  it("distinguishes a stdio server from a remote one", () => {
    expect(serverCommandHash(stdio)).not.toBe(serverCommandHash(remote));
  });

  it("returns a non-empty string for an empty spec", () => {
    expect(serverCommandHash({})).toMatch(/^[a-z0-9]+$/);
  });
});

describe("serverApprovalStatus", () => {
  it("a matching approved record → approved", () => {
    const records = recordServerApproval([], "fs", stdio, true);
    expect(serverApprovalStatus("fs", stdio, records)).toBe("approved");
  });

  it("no record for the name → needs-approval", () => {
    expect(serverApprovalStatus("fs", stdio, [])).toBe("needs-approval");
  });

  it("a name match with a DIFFERENT command hash → changed (command changed → re-ask)", () => {
    const records = recordServerApproval([], "fs", stdio, true);
    expect(serverApprovalStatus("fs", stdioChanged, records)).toBe("changed");
  });

  it("a record for the current command but NOT approved (prior deny) → needs-approval", () => {
    const records = recordServerApproval([], "fs", stdio, false);
    expect(serverApprovalStatus("fs", stdio, records)).toBe("needs-approval");
  });

  it("changed wins over a prior deny when the command changed", () => {
    const records = recordServerApproval([], "fs", stdio, false);
    expect(serverApprovalStatus("fs", stdioChanged, records)).toBe("changed");
  });
});

describe("recordServerApproval", () => {
  it("upserts by name (does not duplicate)", () => {
    let records: ServerApprovalRecord[] = recordServerApproval([], "fs", stdio, true);
    records = recordServerApproval(records, "fs", stdio, false);
    expect(records.filter((r) => r.serverName === "fs")).toHaveLength(1);
    expect(serverApprovalStatus("fs", stdio, records)).toBe("needs-approval");
  });

  it("a re-approval after a command change updates the bound hash", () => {
    let records = recordServerApproval([], "fs", stdio, true);
    // command changes → status flips to changed
    expect(serverApprovalStatus("fs", stdioChanged, records)).toBe("changed");
    // operator re-approves with the NEW command
    records = recordServerApproval(records, "fs", stdioChanged, true);
    expect(serverApprovalStatus("fs", stdioChanged, records)).toBe("approved");
    // and the OLD command is no longer the approved one
    expect(serverApprovalStatus("fs", stdio, records)).toBe("changed");
  });

  it("does not mutate the input records array", () => {
    const input: ServerApprovalRecord[] = [];
    const out = recordServerApproval(input, "fs", stdio, true);
    expect(input).toHaveLength(0);
    expect(out).toHaveLength(1);
  });

  it("preserves other servers' records", () => {
    let records = recordServerApproval([], "fs", stdio, true);
    records = recordServerApproval(records, "web", remote, true);
    expect(records).toHaveLength(2);
    expect(serverApprovalStatus("fs", stdio, records)).toBe("approved");
    expect(serverApprovalStatus("web", remote, records)).toBe("approved");
  });
});

describe("serversNeedingApproval", () => {
  const servers: Record<string, ApprovableServer> = { fs: stdio, web: remote };

  it("an empty records → ALL servers need approval", () => {
    expect(serversNeedingApproval(servers, []).sort()).toEqual(["fs", "web"]);
  });

  it("returns needs-approval names", () => {
    const records = recordServerApproval([], "web", remote, true);
    expect(serversNeedingApproval(servers, records)).toEqual(["fs"]);
  });

  it("returns CHANGED names (a changed command must be re-confirmed)", () => {
    let records = recordServerApproval([], "fs", stdio, true);
    records = recordServerApproval(records, "web", remote, true);
    // fs's command changed in the config since approval
    const changedServers: Record<string, ApprovableServer> = { fs: stdioChanged, web: remote };
    expect(serversNeedingApproval(changedServers, records)).toEqual(["fs"]);
  });

  it("returns [] when every server is approved with its current command", () => {
    let records = recordServerApproval([], "fs", stdio, true);
    records = recordServerApproval(records, "web", remote, true);
    expect(serversNeedingApproval(servers, records)).toEqual([]);
  });

  // INVARIANT: an unapproved or changed server is NEVER silently mountable —
  // it is always surfaced for confirmation before mount.
  it("INVARIANT: an unapproved server is always in serversNeedingApproval", () => {
    // fs unapproved, web denied, a third never seen — none may auto-mount.
    let records = recordServerApproval([], "web", remote, false);
    const all: Record<string, ApprovableServer> = { fs: stdio, web: remote, extra: { command: "node" } };
    const needing = serversNeedingApproval(all, records).sort();
    expect(needing).toEqual(["extra", "fs", "web"]);
  });

  it("INVARIANT: a changed server is always in serversNeedingApproval", () => {
    const records = recordServerApproval([], "fs", stdio, true);
    const changed: Record<string, ApprovableServer> = { fs: stdioChanged };
    expect(serversNeedingApproval(changed, records)).toEqual(["fs"]);
  });
});
