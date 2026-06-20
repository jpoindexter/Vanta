import { describe, it, expect } from "vitest";
import {
  grantAuthority,
  revokeAuthority,
  checkDelegated,
  auditDelegatedDecision,
  deriveGrantId,
  readGrants,
  writeGrants,
  appendAuditRecord,
  readAuditLog,
  type AuthorityGrant,
  type AuthorityFs,
  type DelegatedRequest,
} from "./delegated-authority.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");

function spendGrant(maxUsd: number, over: Partial<AuthorityGrant> = {}): AuthorityGrant {
  const made = grantAuthority([], { delegator: "owner", delegate: "manager", class: { kind: "spend", maxUsd } }, NOW);
  if (!made.ok) throw new Error(made.error);
  return { ...made.value, ...over };
}

function writeGrant(scope: string, over: Partial<AuthorityGrant> = {}): AuthorityGrant {
  const made = grantAuthority([], { delegator: "owner", delegate: "manager", class: { kind: "writeScope", scope } }, NOW);
  if (!made.ok) throw new Error(made.error);
  return { ...made.value, ...over };
}

describe("grantAuthority", () => {
  it("creates an active spend grant within bound", () => {
    const r = grantAuthority([], { delegator: "owner", delegate: "manager", class: { kind: "spend", maxUsd: 500 } }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.active).toBe(true);
    expect(r.value.class).toEqual({ kind: "spend", maxUsd: 500 });
    expect(r.value.grantedAt).toBe(NOW.toISOString());
    expect(r.value.revokedAt).toBeUndefined();
  });

  it("creates a writeScope grant", () => {
    const r = grantAuthority([], { delegator: "owner", delegate: "manager", class: { kind: "writeScope", scope: "/repo/docs" } }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.class).toEqual({ kind: "writeScope", scope: "/repo/docs" });
  });

  it("rejects an empty delegator", () => {
    const r = grantAuthority([], { delegator: "  ", delegate: "manager", class: { kind: "spend", maxUsd: 10 } }, NOW);
    expect(r).toEqual({ ok: false, error: "delegator is required" });
  });

  it("rejects an empty delegate", () => {
    const r = grantAuthority([], { delegator: "owner", delegate: "", class: { kind: "spend", maxUsd: 10 } }, NOW);
    expect(r).toEqual({ ok: false, error: "delegate is required" });
  });

  it("rejects self-delegation", () => {
    const r = grantAuthority([], { delegator: "owner", delegate: "owner", class: { kind: "spend", maxUsd: 10 } }, NOW);
    expect(r.ok).toBe(false);
  });

  it("rejects a non-positive spend bound (default-deny on ambiguity)", () => {
    const r = grantAuthority(
      [],
      { delegator: "owner", delegate: "manager", class: { kind: "spend", maxUsd: 0 } },
      NOW,
    );
    expect(r.ok).toBe(false);
  });

  it("derives unique ids for repeat delegator→delegate pairs", () => {
    const first = spendGrant(100);
    expect(deriveGrantId([first], "owner", "manager")).toBe(`${first.id}-2`);
  });
});

describe("revokeAuthority", () => {
  it("marks a grant inactive without deleting it", () => {
    const g = spendGrant(100);
    const r = revokeAuthority([g], g.id, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(1);
    const [revoked] = r.value;
    expect(revoked?.active).toBe(false);
    expect(revoked?.revokedAt).toBe(NOW.toISOString());
  });

  it("errors on an unknown id", () => {
    const r = revokeAuthority([spendGrant(100)], "nope", NOW);
    expect(r.ok).toBe(false);
  });
});

describe("checkDelegated — Ask-class within bound auto-approves", () => {
  it("auto-approves a spend within the bound", () => {
    const g = spendGrant(500);
    const req: DelegatedRequest = { risk: "ask", action: "buy ad credits", amountUsd: 400 };
    const res = checkDelegated(req, [g]);
    expect(res.autoApprove).toBe(true);
    expect(res.byGrant?.id).toBe(g.id);
  });

  it("auto-approves a spend exactly at the bound", () => {
    const g = spendGrant(500);
    const res = checkDelegated({ risk: "ask", action: "spend", amountUsd: 500 }, [g]);
    expect(res.autoApprove).toBe(true);
  });

  it("auto-approves a write inside the granted scope", () => {
    const g = writeGrant("/repo/docs");
    const res = checkDelegated({ risk: "ask", action: "write a doc", writePath: "/repo/docs/spec.md" }, [g]);
    expect(res.autoApprove).toBe(true);
    expect(res.byGrant?.id).toBe(g.id);
  });
});

describe("checkDelegated — out of bound never auto-approves", () => {
  it("denies a spend over the bound", () => {
    const g = spendGrant(500);
    expect(checkDelegated({ risk: "ask", action: "spend", amountUsd: 501 }, [g]).autoApprove).toBe(false);
  });

  it("denies a write outside the granted scope", () => {
    const g = writeGrant("/repo/docs");
    expect(checkDelegated({ risk: "ask", action: "write", writePath: "/repo/secrets/key.pem" }, [g]).autoApprove).toBe(false);
  });

  it("denies a write-scope grant against a spend request (kind mismatch)", () => {
    const g = writeGrant("/repo/docs");
    expect(checkDelegated({ risk: "ask", action: "spend", amountUsd: 1 }, [g]).autoApprove).toBe(false);
  });

  it("denies a spend grant against a write request (kind mismatch)", () => {
    const g = spendGrant(500);
    expect(checkDelegated({ risk: "ask", action: "write", writePath: "/repo/docs/a.md" }, [g]).autoApprove).toBe(false);
  });

  it("denies a spend with no amount supplied (default-deny on ambiguity)", () => {
    const g = spendGrant(500);
    expect(checkDelegated({ risk: "ask", action: "spend" }, [g]).autoApprove).toBe(false);
  });
});

describe("checkDelegated — the security floor", () => {
  it("NEVER auto-approves a Block-floor request, even within bound", () => {
    const g = spendGrant(500);
    const res = checkDelegated({ risk: "block", action: "destructive", amountUsd: 1 }, [g]);
    expect(res.autoApprove).toBe(false);
    expect(res.byGrant).toBeUndefined();
  });

  it("NEVER auto-approves a Block write inside the granted scope", () => {
    const g = writeGrant("/repo/docs");
    expect(checkDelegated({ risk: "block", action: "rm -rf", writePath: "/repo/docs/a.md" }, [g]).autoApprove).toBe(false);
  });

  it("does NOT auto-approve an Allow-class request (only Ask is delegable)", () => {
    const g = spendGrant(500);
    expect(checkDelegated({ risk: "allow", action: "read", amountUsd: 1 }, [g]).autoApprove).toBe(false);
  });
});

describe("checkDelegated — revoked / inactive grants", () => {
  it("does NOT auto-approve via a revoked grant", () => {
    const g = spendGrant(500);
    const revoked = revokeAuthority([g], g.id, NOW);
    expect(revoked.ok).toBe(true);
    if (!revoked.ok) return;
    expect(checkDelegated({ risk: "ask", action: "spend", amountUsd: 1 }, revoked.value).autoApprove).toBe(false);
  });

  it("denies when no grants exist (default-deny)", () => {
    expect(checkDelegated({ risk: "ask", action: "spend", amountUsd: 1 }, []).autoApprove).toBe(false);
  });

  it("uses the active grant when a revoked and an active grant both exist", () => {
    const revoked = spendGrant(10, { id: "old", active: false });
    const active = spendGrant(500, { id: "new" });
    const res = checkDelegated({ risk: "ask", action: "spend", amountUsd: 400 }, [revoked, active]);
    expect(res.autoApprove).toBe(true);
    expect(res.byGrant?.id).toBe("new");
  });
});

describe("auditDelegatedDecision", () => {
  it("records the delegator, delegate, action, grant id, and timestamp", () => {
    const g = spendGrant(500);
    const rec = auditDelegatedDecision(g, "  buy ad credits  ", NOW);
    expect(rec).toEqual({
      delegator: "owner",
      delegate: "manager",
      action: "buy ad credits",
      grantId: g.id,
      at: NOW.toISOString(),
    });
  });
});

// ---- Store + audit log (injected fs) ----

function fakeFs(): { fs: AuthorityFs; files: Map<string, string> } {
  const files = new Map<string, string>();
  const fs: AuthorityFs = {
    readFile: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error("ENOENT");
      return v;
    },
    writeFile: async (p, d) => void files.set(p, d),
    appendFile: async (p, d) => void files.set(p, (files.get(p) ?? "") + d),
    mkdir: async () => undefined,
  };
  return { fs, files };
}

const ENV = { VANTA_HOME: "/tmp/vanta-test-home" } as unknown as NodeJS.ProcessEnv;

describe("grants store (injected fs)", () => {
  it("round-trips grants through write/read", async () => {
    const { fs } = fakeFs();
    const g = spendGrant(500);
    await writeGrants([g], ENV, fs);
    expect(await readGrants(ENV, fs)).toEqual([g]);
  });

  it("returns [] for a missing file", async () => {
    const { fs } = fakeFs();
    expect(await readGrants(ENV, fs)).toEqual([]);
  });

  it("tolerates a corrupt file → []", async () => {
    const { fs, files } = fakeFs();
    files.set("/tmp/vanta-test-home/authority-grants.json", "{ not json");
    expect(await readGrants(ENV, fs)).toEqual([]);
  });

  it("drops malformed rows but keeps valid ones", async () => {
    const { fs, files } = fakeFs();
    const g = spendGrant(500);
    files.set(
      "/tmp/vanta-test-home/authority-grants.json",
      JSON.stringify({ version: 1, grants: [g, { junk: true }] }),
    );
    expect(await readGrants(ENV, fs)).toEqual([g]);
  });
});

describe("audit log (append-only, injected fs)", () => {
  it("appends and reads back records in order", async () => {
    const { fs } = fakeFs();
    const g = spendGrant(500);
    const r1 = auditDelegatedDecision(g, "first", NOW);
    const r2 = auditDelegatedDecision(g, "second", new Date("2026-06-20T13:00:00.000Z"));
    await appendAuditRecord(r1, ENV, fs);
    await appendAuditRecord(r2, ENV, fs);
    expect(await readAuditLog(ENV, fs)).toEqual([r1, r2]);
  });

  it("returns [] when the log is missing", async () => {
    const { fs } = fakeFs();
    expect(await readAuditLog(ENV, fs)).toEqual([]);
  });

  it("drops a malformed line, keeps the valid one", async () => {
    const { fs, files } = fakeFs();
    const g = spendGrant(500);
    const rec = auditDelegatedDecision(g, "ok", NOW);
    files.set("/tmp/vanta-test-home/authority-audit.jsonl", `not json\n${JSON.stringify(rec)}\n`);
    expect(await readAuditLog(ENV, fs)).toEqual([rec]);
  });
});
