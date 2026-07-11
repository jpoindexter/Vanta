import { chmod, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { listVaultSecrets, manifestPath } from "../secrets/vault-manager.js";
import type { KeychainRunner } from "../store/keychain.js";
import { PaymentContractSchema } from "./contract.js";
import { executeStripeProjects, type StripeProjectsRunner } from "./projects.js";

function contract() {
  const value = PaymentContractSchema.parse({
    version: 1, environment: "test", id: "pay_projects_1234", provider: "stripe_projects",
    merchant: { name: "Stripe Projects", url: "https://stripe.com" }, item: { name: "Neon database", quantity: 1 },
    currency: "usd", currencyExponent: 2, amountMinor: 0, caps: { perPurchaseMinor: 0, periodMinor: 0, period: "day" },
    credential: { type: "stripe_cli", storage: "provider_cli" }, expiresAt: "2099-07-12T00:00:00Z",
    provisioning: { service: "neon/postgres", credentialVaultRefs: ["DATABASE_URL", "DATABASE_KEY"] },
  });
  if (value.provider !== "stripe_projects") throw new Error("fixture mismatch"); return value;
}

function keychain() {
  const values = new Map<string, string>(), calls: Array<{ args: readonly string[]; stdin?: string }> = [];
  const run: KeychainRunner = async (args, stdin) => {
    calls.push({ args, stdin }); const service = args[args.indexOf("-s") + 1]!;
    if (args[0] === "add-generic-password") { values.set(service, stdin ?? ""); return { ok: true, stdout: "" }; }
    if (args[0] === "delete-generic-password") { values.delete(service); return { ok: true, stdout: "" }; }
    return { ok: false, error: "not found", notFound: true };
  };
  return { run, values, calls };
}

describe("Stripe Projects vault-only adapter", () => {
  it("moves exact generated credentials into Keychain through stdin and leaves only vault references", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-project-root-")), env = { VANTA_HOME: join(root, ".vanta"), VANTA_KEYCHAIN: "1" }, key = keychain();
    let workspace = "";
    const run: StripeProjectsRunner = async (args, cwd) => {
      workspace = cwd;
      if (args[1] === "add") await writeFile(join(cwd, ".env"), "DATABASE_URL=postgres://private\nDATABASE_KEY=secret-key\n");
      return { code: 0, stdout: "ok", stderr: "" };
    };
    expect(await executeStripeProjects(root, contract(), { env, platform: "darwin", run, keychainRun: key.run })).toEqual({ ok: true, state: "service_provisioned_vaulted", external: "approved" });
    expect(key.values.size).toBe(2); expect(key.calls.filter((call) => call.args[0] === "add-generic-password").map((call) => call.stdin)).toEqual(["postgres://private", "secret-key"]);
    expect(key.calls.flatMap((call) => call.args).join(" ")).not.toMatch(/postgres|secret-key/);
    expect((await listVaultSecrets(env)).map((record) => record.name)).toEqual(["DATABASE_URL", "DATABASE_KEY"]);
    const manifest = await readFile(manifestPath(env), "utf8"); expect(manifest).not.toMatch(/postgres|secret-key/);
    await expect(stat(workspace)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects unexpected generated keys before touching the vault", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-project-root-")), key = keychain();
    const run: StripeProjectsRunner = async (args, cwd) => {
      if (args[1] === "add") await writeFile(join(cwd, ".env"), "DATABASE_URL=private\nUNAPPROVED_KEY=secret\n");
      return { code: 0, stdout: "", stderr: "" };
    };
    expect(await executeStripeProjects(root, contract(), { env: { VANTA_HOME: join(root, ".vanta"), VANTA_KEYCHAIN: "1" }, platform: "darwin", run, keychainRun: key.run })).toMatchObject({ ok: false, state: "generated_credentials_mismatch" });
    expect(key.calls).toEqual([]);
  });

  it("rolls back Keychain writes when a later credential cannot be stored", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-project-root-")), key = keychain(), base = key.run, add = vi.fn();
    const failing: KeychainRunner = async (args, stdin) => {
      if (args[0] === "add-generic-password" && add.mock.calls.length > 0) return { ok: false, error: "failed", notFound: false };
      if (args[0] === "add-generic-password") add(); return base(args, stdin);
    };
    const run: StripeProjectsRunner = async (args, cwd) => { if (args[1] === "add") await writeFile(join(cwd, ".env"), "DATABASE_URL=one\nDATABASE_KEY=two\n"); return { code: 0, stdout: "", stderr: "" }; };
    expect(await executeStripeProjects(root, contract(), { env: { VANTA_HOME: join(root, ".vanta"), VANTA_KEYCHAIN: "1" }, platform: "darwin", run, keychainRun: failing })).toMatchObject({ ok: false, state: "vault_store_failed" });
    expect(key.values.size).toBe(0);
  });

  it("executes the configured test CLI as a real child process", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-project-root-")), script = join(root, "stripe-projects-test.sh"), key = keychain();
    await writeFile(script, "#!/bin/sh\nif [ \"$2\" = \"add\" ]; then printf 'DATABASE_URL=postgres://child-process\\nDATABASE_KEY=child-secret\\n' > .env; fi\n");
    await chmod(script, 0o700);
    const previous = process.env.VANTA_PAYMENT_TEST_STRIPE_PROJECTS_CLI; process.env.VANTA_PAYMENT_TEST_STRIPE_PROJECTS_CLI = script;
    try {
      const env = { VANTA_HOME: join(root, ".vanta"), VANTA_KEYCHAIN: "1" };
      expect(await executeStripeProjects(root, contract(), { env, platform: "darwin", keychainRun: key.run })).toMatchObject({ ok: true, state: "service_provisioned_vaulted" });
      expect([...key.values.values()]).toEqual(["postgres://child-process", "child-secret"]);
    } finally {
      if (previous === undefined) delete process.env.VANTA_PAYMENT_TEST_STRIPE_PROJECTS_CLI;
      else process.env.VANTA_PAYMENT_TEST_STRIPE_PROJECTS_CLI = previous;
    }
  });
});
