import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  activateVaultEnvironment, addVaultSecret, addVaultSecrets, auditPath, injectVaultSecrets, listVaultSecrets, rotateVaultSecret, vaultSecretStatus,
} from "./vault-manager.js";

let home = "";
afterEach(async () => { if (home) await rm(home, { recursive: true, force: true }); });
const env = (): NodeJS.ProcessEnv => ({ VANTA_HOME: home, BW_SESSION: "bootstrap" });

describe("vault secret manager", () => {
  it("stores aliases and scopes without secret values and reports stale/overbroad records", async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-vault-manager-"));
    await addVaultSecret({ name: "OPENAI_API_KEY", backend: "bitwarden", ref: "item-old", scopes: ["*"], rotatedAt: "2026-01-01T00:00:00.000Z" }, env());
    const records = await listVaultSecrets(env());
    expect(records).toHaveLength(1);
    expect(JSON.stringify(records)).not.toContain("bootstrap");
    expect(vaultSecretStatus(records[0]!, new Date("2026-07-11T00:00:00.000Z"))).toMatchObject({ stale: true, overbroad: true });
  });

  it("adds a keychain-backed alias batch atomically and rejects duplicate names", async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-vault-manager-"));
    await addVaultSecrets([
      { name: "DATABASE_URL", backend: "keychain", ref: "vanta-project-db", scopes: ["payment:stripe-projects"] },
      { name: "DATABASE_KEY", backend: "keychain", ref: "vanta-project-key", scopes: ["payment:stripe-projects"] },
    ], { ...env(), VANTA_KEYCHAIN: "1" });
    expect((await listVaultSecrets(env())).map((record) => record.backend)).toEqual(["keychain", "keychain"]);
    await expect(addVaultSecrets([
      { name: "DUPLICATE_KEY", backend: "keychain", ref: "one", scopes: ["payment:stripe-projects"] },
      { name: "DUPLICATE_KEY", backend: "keychain", ref: "two", scopes: ["payment:stripe-projects"] },
    ], env())).rejects.toThrow("already exists");
  });

  it("injects only records granted to the active scope and uses each selected backend", async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-vault-manager-"));
    await addVaultSecret({ name: "OPENAI_API_KEY", backend: "bitwarden", ref: "bw-openai", scopes: ["profile:research"] }, env());
    await addVaultSecret({ name: "GEMINI_API_KEY", backend: "1password", ref: "op://V/G/key", scopes: ["profile:other"] }, env());
    const exec = vi.fn(async (cmd: string) => cmd === "bw" ? "openai-value" : "gemini-value");
    const target: NodeJS.ProcessEnv = { ...env() };
    const result = await injectVaultSecrets("profile:research", target, exec);
    expect(result).toEqual({ injected: ["OPENAI_API_KEY"], missing: [] });
    expect(target.OPENAI_API_KEY).toBe("openai-value");
    expect(target.GEMINI_API_KEY).toBeUndefined();
    expect(exec).toHaveBeenCalledWith("bw", ["get", "password", "bw-openai"]);
  });

  it("rotates only after confirmation, verifies the new ref, and audits hashes without refs or values", async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-vault-manager-"));
    await addVaultSecret({ name: "OPENAI_API_KEY", backend: "bitwarden", ref: "item-old", scopes: ["profile:research"] }, env());
    const exec = vi.fn(async () => "new-secret-value");
    await expect(rotateVaultSecret("OPENAI_API_KEY", "item-new", { env: env(), exec, confirmed: false })).rejects.toThrow(/confirmation/i);
    const rotated = await rotateVaultSecret("OPENAI_API_KEY", "item-new", { env: env(), exec, confirmed: true, now: new Date("2026-07-11T12:00:00.000Z") });
    expect(rotated.ref).toBe("item-new");
    const audit = await readFile(auditPath(env()), "utf8");
    expect(audit).toContain("OPENAI_API_KEY");
    expect(audit).toContain("oldRefHash");
    expect(audit).not.toContain("item-old");
    expect(audit).not.toContain("item-new");
    expect(audit).not.toContain("new-secret-value");
  });

  it("activates scoped vault aliases from the base home for an active profile", async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-vault-manager-"));
    await addVaultSecret({ name: "OPENAI_API_KEY", backend: "bitwarden", ref: "profile-key", scopes: ["profile:research"] }, env());
    const activeEnv: NodeJS.ProcessEnv = {
      VANTA_HOME: join(home, "profiles", "research"), VANTA_PROFILE_BASE_HOME: home,
      VANTA_PROFILE: "research", BW_SESSION: "bootstrap",
    };
    const result = await activateVaultEnvironment(activeEnv, vi.fn(async () => "profile-secret"));
    expect(result).toEqual({ scope: "profile:research", injected: ["OPENAI_API_KEY"], missing: [] });
    expect(activeEnv.OPENAI_API_KEY).toBe("profile-secret");
    expect(activeEnv.VANTA_SECRET_SCOPE).toBe("profile:research");
  });
});
