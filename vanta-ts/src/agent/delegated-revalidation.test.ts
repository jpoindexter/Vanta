import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { delegatedDecisionIsCurrent, tryDelegatedAutoApprove } from "./delegated-gate.js";
import { grantsPath, readGrants, readGrantsSync, writeGrants, type AuthorityGrant } from "../cofounder/delegated-authority.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "delegated-current-")); roots.push(root);
  const inside = join(root, "inside"), outside = join(root, "outside"); await mkdir(inside); await mkdir(outside);
  const grant: AuthorityGrant = { id: "g1", delegator: "owner", delegate: "writer", active: true,
    grantedAt: "2026-10-29T00:00:00Z", class: { kind: "writeScope", scope: inside } };
  const env = { VANTA_HOME: join(root, "home") }; await writeGrants([grant], env);
  const decide = () => tryDelegatedAutoApprove({ id: "c", name: "write_file", arguments: { path: join(inside, "a.txt"), content: "x" } }, "write fixture", {
    root, readGrants: () => readGrants(env), appendAudit: async () => {},
  });
  return { root, inside, outside, grant, env, decide };
}

describe("delegated decision revalidation", () => {
  it("retains an unchanged serialized grant without mutating its store", async () => {
    const f = await fixture(), decision = await f.decide(); expect(decision).not.toBeNull();
    const before = await readFile(grantsPath(f.env), "utf8");
    expect(delegatedDecisionIsCurrent(decision!, readGrantsSync(f.env))).toBe(true);
    expect(await readFile(grantsPath(f.env), "utf8")).toBe(before);
  });

  it.each(["revoked", "delegate", "delegator", "scope", "id", "time", "duplicate", "duplicate-relative", "deleted", "corrupt"])("refuses %s authority after approval", async mode => {
    const f = await fixture(), decision = await f.decide(); expect(decision).not.toBeNull();
    let grants = [f.grant];
    if (mode === "revoked") f.grant.active = false;
    if (mode === "delegate") f.grant.delegate = "other-worker";
    if (mode === "delegator") f.grant.delegator = "other-owner";
    if (mode === "scope") f.grant.class = { kind: "writeScope", scope: f.root };
    if (mode === "id") f.grant.id = "replacement";
    if (mode === "time") f.grant.grantedAt = "2026-10-29T01:00:00Z";
    if (mode === "duplicate") grants = [f.grant, { ...f.grant }];
    if (mode === "duplicate-relative") grants = [f.grant, { ...f.grant, class: { kind: "writeScope", scope: "relative" } }];
    await writeGrants(grants, f.env);
    if (mode === "deleted") await unlink(grantsPath(f.env));
    if (mode === "corrupt") await writeFile(grantsPath(f.env), "not json");
    expect(delegatedDecisionIsCurrent(decision!, readGrantsSync(f.env))).toBe(false);
  });

  it("rejects a grant-directory alias moved after the decision", async () => {
    const f = await fixture(), alias = join(f.root, "alias"); await symlink(f.inside, alias);
    f.grant.class = { kind: "writeScope", scope: alias }; await writeGrants([f.grant], f.env);
    const decision = await f.decide(); expect(decision).not.toBeNull();
    await unlink(alias); await symlink(f.outside, alias);
    expect(delegatedDecisionIsCurrent(decision!, readGrantsSync(f.env))).toBe(false);
  });
});
