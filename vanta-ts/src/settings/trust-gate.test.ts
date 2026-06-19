import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProjectTrust, resolveMcpTrust, collectContextFiles, trustAuto, type TrustConfirmer } from "./trust-gate.js";
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

describe("trustAuto (pure)", () => {
  it("is false with no env flag and no setting", () => {
    expect(trustAuto({})).toBe(false);
    expect(trustAuto({}, {})).toBe(false);
    expect(trustAuto({}, { trust: {} })).toBe(false);
    expect(trustAuto({}, { trust: { auto: false } })).toBe(false);
  });

  it("is true when settings.trust.auto is set", () => {
    expect(trustAuto({}, { trust: { auto: true } })).toBe(true);
  });

  it("is true for truthy VANTA_TRUST_ALL values, false otherwise", () => {
    for (const v of ["1", "true", "TRUE", "yes", "on", " on "]) {
      expect(trustAuto({ VANTA_TRUST_ALL: v })).toBe(true);
    }
    for (const v of ["0", "false", "no", "off", ""]) {
      expect(trustAuto({ VANTA_TRUST_ALL: v })).toBe(false);
    }
  });
});

describe("resolveProjectTrust auto-trust lever", () => {
  it("auto-trusts (and persists) via settings.trust.auto without asking", async () => {
    await writeFile(join(root, "CLAUDE.md"), "# rules", "utf8");
    const c = counting(false);
    expect(await resolveProjectTrust(root, c.confirm, { env: {}, settings: { trust: { auto: true } } })).toBe(true);
    expect(c.calls).toBe(0);
    expect(await isProjectTrusted(root)).toBe(true); // durable
  });

  it("auto-trusts (and persists) via VANTA_TRUST_ALL without asking", async () => {
    await writeFile(join(root, "VANTA.md"), "# vanta", "utf8");
    const c = counting(false);
    expect(await resolveProjectTrust(root, c.confirm, { env: { VANTA_TRUST_ALL: "1" } })).toBe(true);
    expect(c.calls).toBe(0);
    expect(await isProjectTrusted(root)).toBe(true);
  });

  it("does not auto-trust without the lever (still asks)", async () => {
    await writeFile(join(root, "CLAUDE.md"), "# rules", "utf8");
    const c = counting(true);
    expect(await resolveProjectTrust(root, c.confirm, { env: {} })).toBe(true);
    expect(c.calls).toBe(1); // the lever was off, so the confirmer ran
  });

  it("honors a persisted deny over the auto lever", async () => {
    await writeFile(join(root, "CLAUDE.md"), "# rules", "utf8");
    expect(await resolveProjectTrust(root, no, { env: {} })).toBe(false); // explicit deny first
    // lever on afterwards must not override an explicit operator decision
    expect(await resolveProjectTrust(root, yes, { env: { VANTA_TRUST_ALL: "1" } })).toBe(false);
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
