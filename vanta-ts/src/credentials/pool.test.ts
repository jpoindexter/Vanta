import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addCredential, leaseCredential, listCredentials, markCredentialFailure, releaseCredential, removeCredential } from "./pool.js";

let home = "";
afterEach(async () => { if (home) await rm(home, { recursive: true, force: true }); });
const env = () => ({ VANTA_HOME: home });

describe("credential pool store", () => {
  it("stores references and hashes, never credential values", async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-credentials-"));
    await addCredential({ provider: "openai", id: "primary", source: "env", ref: "OPENAI_KEY_PRIMARY" }, env());
    const records = await listCredentials(env());
    expect(records[0]).toMatchObject({ provider: "openai", id: "primary", source: "env", status: "ready" });
    const raw = await readFile(join(home, "credential-pools.json"), "utf8");
    expect(raw).not.toContain("sk-");
  });

  it("leases different credentials to concurrent owners and releases them", async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-credentials-"));
    await addCredential({ provider: "openai", id: "one", source: "env", ref: "KEY_ONE" }, env());
    await addCredential({ provider: "openai", id: "two", source: "env", ref: "KEY_TWO" }, env());
    const first = await leaseCredential("openai", "agent:a", env(), new Date("2026-07-11T12:00:00Z"));
    const second = await leaseCredential("openai", "agent:b", env(), new Date("2026-07-11T12:00:00Z"));
    expect(first?.id).not.toBe(second?.id);
    await releaseCredential(first!.leaseId, env());
    expect((await leaseCredential("openai", "agent:c", env(), new Date("2026-07-11T12:00:01Z")))?.id).toBe(first?.id);
  });

  it("cools down rate-limited keys and exhausts auth or billing failures", async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-credentials-"));
    await addCredential({ provider: "openai", id: "rate", source: "env", ref: "RATE" }, env());
    await addCredential({ provider: "openai", id: "billing", source: "env", ref: "BILLING" }, env());
    const rate = await leaseCredential("openai", "a", env(), new Date("2026-07-11T12:00:00Z"));
    await markCredentialFailure(rate!.leaseId, new Error("429 too many requests"), env(), new Date("2026-07-11T12:00:00Z"));
    const billing = await leaseCredential("openai", "b", env(), new Date("2026-07-11T12:00:01Z"));
    await markCredentialFailure(billing!.leaseId, new Error("402 payment required"), env(), new Date("2026-07-11T12:00:01Z"));
    expect(await listCredentials(env())).toMatchObject([
      { id: "rate", status: "cooldown" }, { id: "billing", status: "exhausted" },
    ]);
    expect(await leaseCredential("openai", "c", env(), new Date("2026-07-11T12:00:02Z"))).toBeNull();
    expect(await removeCredential("openai", "billing", env())).toBe(true);
  });
});
