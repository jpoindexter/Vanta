import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProjectTrust, resolveMcpTrust, collectContextFiles, type TrustConfirmer } from "./trust-gate.js";
import { isProjectTrusted, isMcpTrusted } from "./trust.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "vanta-trustgate-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const yes: TrustConfirmer = async () => true;
const no: TrustConfirmer = async () => false;
function counting(answer: boolean): { confirm: TrustConfirmer; calls: number } {
  const c = { confirm: (async () => { c.calls += 1; return answer; }) as TrustConfirmer, calls: 0 };
  return c;
}

describe("resolveProjectTrust", () => {
  it("trusts a project with no context files without asking", async () => {
    const c = counting(false);
    expect(await resolveProjectTrust(root, c.confirm)).toBe(true);
    expect(c.calls).toBe(0);
  });

  it("fails safe (untrusted) for an undecided project with no confirmer", async () => {
    await writeFile(join(root, "CLAUDE.md"), "# rules", "utf8");
    expect(await resolveProjectTrust(root)).toBe(false);
    // no decision persisted — it can still be asked later interactively
    expect(await isProjectTrusted(root)).toBe(false);
  });

  it("asks once, persists, and recalls without asking again", async () => {
    await writeFile(join(root, "VANTA.md"), "# vanta", "utf8");
    const c = counting(true);
    expect(await resolveProjectTrust(root, c.confirm)).toBe(true);
    expect(c.calls).toBe(1);
    expect(await isProjectTrusted(root)).toBe(true);
    // second call recalls the stored decision, does not ask again
    expect(await resolveProjectTrust(root, c.confirm)).toBe(true);
    expect(c.calls).toBe(1);
  });

  it("persists a deny and does not load context thereafter", async () => {
    await writeFile(join(root, "CLAUDE.md"), "# rules", "utf8");
    expect(await resolveProjectTrust(root, no)).toBe(false);
    expect(await resolveProjectTrust(root, yes)).toBe(false); // recalled deny, not re-asked
  });
});

describe("collectContextFiles", () => {
  it("returns only present, non-empty context files", async () => {
    await writeFile(join(root, "CLAUDE.md"), "# a", "utf8");
    await writeFile(join(root, "README.md"), "  \n ", "utf8"); // whitespace only → skipped
    const files = await collectContextFiles(root);
    expect(files.map((f) => f.name)).toEqual(["CLAUDE.md"]);
  });
});

describe("resolveMcpTrust", () => {
  const tools = [{ name: "t1", description: "d" }];

  it("fails safe (untrusted) with no confirmer", async () => {
    expect(await resolveMcpTrust(root, "srv", tools)).toBe(false);
  });

  it("asks once, persists, and recalls", async () => {
    const c = counting(true);
    expect(await resolveMcpTrust(root, "srv", tools, c.confirm)).toBe(true);
    expect(await isMcpTrusted(root, "srv")).toBe(true);
    expect(await resolveMcpTrust(root, "srv", tools, c.confirm)).toBe(true);
    expect(c.calls).toBe(1);
  });

  it("gates servers independently", async () => {
    await resolveMcpTrust(root, "good", tools, yes);
    await resolveMcpTrust(root, "bad", tools, no);
    expect(await isMcpTrusted(root, "good")).toBe(true);
    expect(await isMcpTrusted(root, "bad")).toBe(false);
  });
});
