import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { addVaultSecret, listVaultSecrets } from "../secrets/vault-manager.js";
import type { KeychainRunner } from "../store/keychain.js";
import { createX402TestWallet } from "./x402-wallet.js";

const PRIVATE_KEY = `0x${"11".repeat(32)}` as `0x${string}`;

describe("x402 test wallet setup", () => {
  it("stores the key through stdin and registers only the scoped alias", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-x402-wallet-"));
    const run = vi.fn<KeychainRunner>(async () => ({ ok: true, stdout: "" }));
    const result = await createX402TestWallet("/project", {
      env: { VANTA_HOME: home }, platform: "darwin", keychainRun: run, generateKey: () => PRIVATE_KEY,
    });

    expect(result).toMatchObject({ ok: true, state: "created", alias: "X402_TEST_SIGNER" });
    expect(run.mock.calls[0]?.[1]).toBe(PRIVATE_KEY);
    expect(run.mock.calls[0]?.[0]).not.toContain(PRIVATE_KEY);
    const manifest = await readFile(join(home, "vault-secrets.json"), "utf8");
    expect(manifest).toContain('"payment:x402"');
    expect(manifest).not.toContain(PRIVATE_KEY);
  });

  it("is fail-closed and idempotent", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-x402-wallet-"));
    const values = new Map<string, string>();
    const run = vi.fn<KeychainRunner>(async (args, stdin) => {
      const service = args[args.indexOf("-s") + 1]!;
      if (args[0] === "find-generic-password") {
        const value = values.get(service);
        return value === undefined
          ? { ok: false, error: "missing", notFound: true }
          : { ok: true, stdout: value };
      }
      if (args[0] === "add-generic-password") {
        values.set(service, stdin!);
        return { ok: true, stdout: "" };
      }
      values.delete(service);
      return { ok: true, stdout: "" };
    });
    const deps = { env: { VANTA_HOME: home }, platform: "darwin" as const, keychainRun: run, generateKey: () => PRIVATE_KEY };
    expect(await createX402TestWallet("/project", deps)).toMatchObject({ ok: true });
    expect(await createX402TestWallet("/project", deps)).toEqual({ ok: false, state: "already_configured" });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("repairs an alias whose Keychain credential is missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-x402-wallet-"));
    const env = { VANTA_HOME: home, VANTA_KEYCHAIN: "1" };
    await addVaultSecret({ name: "X402_TEST_SIGNER", backend: "keychain", ref: "stale-service", scopes: ["payment:x402"] }, env);
    const values = new Map<string, string>();
    const run = vi.fn<KeychainRunner>(async (args, stdin) => {
      const service = args[args.indexOf("-s") + 1]!;
      if (args[0] === "find-generic-password") {
        const value = values.get(service);
        return value === undefined
          ? { ok: false, error: "missing", notFound: true }
          : { ok: true, stdout: value };
      }
      if (args[0] === "add-generic-password") {
        values.set(service, stdin!);
        return { ok: true, stdout: "" };
      }
      values.delete(service);
      return { ok: true, stdout: "" };
    });
    const result = await createX402TestWallet(home, {
      env, platform: "darwin", keychainRun: run, generateKey: () => PRIVATE_KEY,
    });
    expect(result).toMatchObject({ ok: true, state: "created" });
    const records = await listVaultSecrets(env);
    expect(records).toHaveLength(1);
    expect(records[0]!.ref).not.toBe("stale-service");
  });

  it("does not register an alias when Keychain rejects the write", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-x402-wallet-"));
    const run = vi.fn<KeychainRunner>(async () => ({ ok: false, error: "failed", notFound: false }));
    expect(await createX402TestWallet("/project", {
      env: { VANTA_HOME: home }, platform: "darwin", keychainRun: run, generateKey: () => PRIVATE_KEY,
    })).toEqual({ ok: false, state: "keychain_write_failed" });
    await expect(readFile(join(home, "vault-secrets.json"), "utf8")).rejects.toThrow();
  });
});
