import { describe, it, expect } from "vitest";
import {
  parseGrantArgs,
  handleAuthority,
  formatGrant,
  formatAuditRecord,
  type AuthorityDeps,
} from "./authority-cmd.js";
import type { AuthorityGrant, DelegatedAuditRecord } from "../cofounder/delegated-authority.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");

function harness(seed: AuthorityGrant[] = [], audit: DelegatedAuditRecord[] = []): {
  deps: AuthorityDeps;
  lines: string[];
  grants: () => AuthorityGrant[];
} {
  let store = [...seed];
  const lines: string[] = [];
  const deps: AuthorityDeps = {
    readGrants: async () => [...store],
    writeGrants: async (list) => void (store = [...list]),
    readAuditLog: async () => [...audit],
    log: (line) => void lines.push(line),
    now: () => NOW,
  };
  return { deps, lines, grants: () => store };
}

describe("parseGrantArgs", () => {
  it("parses a spend grant", () => {
    const r = parseGrantArgs(["owner", "manager", "--spend", "500"]);
    expect(r).toEqual({ ok: true, value: { delegator: "owner", delegate: "manager", class: { kind: "spend", maxUsd: 500 } } });
  });

  it("parses a write-scope grant", () => {
    const r = parseGrantArgs(["owner", "manager", "--write-scope", "/repo/docs"]);
    expect(r).toEqual({
      ok: true,
      value: { delegator: "owner", delegate: "manager", class: { kind: "writeScope", scope: "/repo/docs" } },
    });
  });

  it("requires two parties", () => {
    expect(parseGrantArgs(["owner", "--spend", "500"]).ok).toBe(false);
  });

  it("requires a bound flag", () => {
    expect(parseGrantArgs(["owner", "manager"]).ok).toBe(false);
  });

  it("rejects both bounds at once", () => {
    expect(parseGrantArgs(["owner", "manager", "--spend", "5", "--write-scope", "/x"]).ok).toBe(false);
  });

  it("rejects a non-positive spend", () => {
    expect(parseGrantArgs(["owner", "manager", "--spend", "-1"]).ok).toBe(false);
    expect(parseGrantArgs(["owner", "manager", "--spend", "abc"]).ok).toBe(false);
  });
});

describe("handleAuthority grant", () => {
  it("persists a parsed grant and reports it", async () => {
    const { deps, lines, grants } = harness();
    const code = await handleAuthority(["grant", "owner", "manager", "--spend", "500"], deps);
    expect(code).toBe(0);
    expect(grants()).toHaveLength(1);
    expect(grants()[0]?.class).toEqual({ kind: "spend", maxUsd: 500 });
    expect(lines.join("\n")).toContain("granted");
  });

  it("fails on a bad grant spec without persisting", async () => {
    const { deps, grants } = harness();
    const code = await handleAuthority(["grant", "owner", "manager"], deps);
    expect(code).toBe(1);
    expect(grants()).toHaveLength(0);
  });
});

describe("handleAuthority list", () => {
  it("notes the empty state", async () => {
    const { deps, lines } = harness();
    expect(await handleAuthority(["list"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("no authority grants");
  });

  it("lists active and revoked grants", async () => {
    const active: AuthorityGrant = {
      id: "g1", delegator: "owner", delegate: "m", class: { kind: "spend", maxUsd: 50 }, active: true, grantedAt: NOW.toISOString(),
    };
    const revoked: AuthorityGrant = { ...active, id: "g2", active: false, revokedAt: NOW.toISOString() };
    const { deps, lines } = harness([active, revoked]);
    await handleAuthority(["list"], deps);
    expect(lines.join("\n")).toContain("active");
    expect(lines.join("\n")).toContain("revoked");
  });
});

describe("handleAuthority revoke", () => {
  it("marks a grant inactive", async () => {
    const g: AuthorityGrant = {
      id: "g1", delegator: "owner", delegate: "m", class: { kind: "spend", maxUsd: 50 }, active: true, grantedAt: NOW.toISOString(),
    };
    const { deps, grants } = harness([g]);
    expect(await handleAuthority(["revoke", "g1"], deps)).toBe(0);
    expect(grants()[0]?.active).toBe(false);
  });

  it("errors on an unknown id", async () => {
    const { deps } = harness();
    expect(await handleAuthority(["revoke", "nope"], deps)).toBe(1);
  });

  it("needs an id", async () => {
    const { deps } = harness();
    expect(await handleAuthority(["revoke"], deps)).toBe(1);
  });
});

describe("handleAuthority audit", () => {
  it("notes the empty state", async () => {
    const { deps, lines } = harness();
    await handleAuthority(["audit"], deps);
    expect(lines.join("\n")).toContain("no delegated decisions");
  });

  it("renders recorded decisions", async () => {
    const rec: DelegatedAuditRecord = { delegator: "owner", delegate: "m", action: "spend", grantId: "g1", at: NOW.toISOString() };
    const { deps, lines } = harness([], [rec]);
    await handleAuthority(["audit"], deps);
    expect(lines.join("\n")).toContain("owner → m");
    expect(lines.join("\n")).toContain("grant g1");
  });
});

describe("handleAuthority unknown / empty", () => {
  it("prints usage with no args (exit 0)", async () => {
    const { deps, lines } = harness();
    expect(await handleAuthority([], deps)).toBe(0);
    expect(lines.join("\n")).toContain("usage:");
  });

  it("prints usage and exit 1 on an unknown sub", async () => {
    const { deps } = harness();
    expect(await handleAuthority(["wat"], deps)).toBe(1);
  });
});

describe("formatters", () => {
  it("formats a spend grant", () => {
    const g: AuthorityGrant = {
      id: "g1", delegator: "owner", delegate: "m", class: { kind: "spend", maxUsd: 50 }, active: true, grantedAt: NOW.toISOString(),
    };
    expect(formatGrant(g)).toContain("spend <= $50");
  });

  it("formats a writeScope grant", () => {
    const g: AuthorityGrant = {
      id: "g1", delegator: "owner", delegate: "m", class: { kind: "writeScope", scope: "/repo/docs" }, active: true, grantedAt: NOW.toISOString(),
    };
    expect(formatGrant(g)).toContain("write in /repo/docs");
  });

  it("formats an audit record", () => {
    const rec: DelegatedAuditRecord = { delegator: "owner", delegate: "m", action: "buy", grantId: "g1", at: NOW.toISOString() };
    expect(formatAuditRecord(rec)).toContain("buy");
  });
});
