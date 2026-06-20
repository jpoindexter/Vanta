import { describe, expect, it, vi } from "vitest";
import {
  SECRET_CATALOG,
  secretBackendById,
  resolveSecretProvider,
  envProvider,
  bitwardenProvider,
  onePasswordProvider,
  keychainProvider,
  getSecret,
  type ExecFn,
} from "./provider.js";

describe("SECRET_CATALOG", () => {
  it("has the four expected backends with the right kinds", () => {
    const byId = Object.fromEntries(SECRET_CATALOG.map((b) => [b.id, b]));
    expect(byId.env?.kind).toBe("env");
    expect(byId.bitwarden?.kind).toBe("cli");
    expect(byId["1password"]?.kind).toBe("cli");
    expect(byId.keychain?.kind).toBe("keychain");
  });
  it("every entry has a label, whatItDoes, and non-empty setupSteps", () => {
    for (const b of SECRET_CATALOG) {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.whatItDoes.length).toBeGreaterThan(0);
      expect(b.setupSteps.length).toBeGreaterThan(0);
      expect(b.implemented).toBe(true);
    }
  });
  it("secretBackendById resolves a known id and returns undefined otherwise", () => {
    expect(secretBackendById("bitwarden")?.id).toBe("bitwarden");
    expect(secretBackendById("nope")).toBeUndefined();
  });
});

describe("resolveSecretProvider", () => {
  it("defaults to the env backend", () => {
    expect(resolveSecretProvider({}).id).toBe("env");
  });
  it("selects each cli/keychain backend by VANTA_SECRET_BACKEND", () => {
    expect(resolveSecretProvider({ VANTA_SECRET_BACKEND: "bitwarden" }).id).toBe("bitwarden");
    expect(resolveSecretProvider({ VANTA_SECRET_BACKEND: "1password" }).id).toBe("1password");
    expect(resolveSecretProvider({ VANTA_SECRET_BACKEND: "keychain" }).id).toBe("keychain");
  });
  it("falls back to env for an unknown backend", () => {
    expect(resolveSecretProvider({ VANTA_SECRET_BACKEND: "vault" }).id).toBe("env");
  });
});

describe("envProvider", () => {
  it("reads process.env[ref] and returns null when absent", async () => {
    const p = envProvider({ OPENAI_API_KEY: "sk-test" });
    expect(await p.get("OPENAI_API_KEY")).toBe("sk-test");
    expect(await p.get("MISSING")).toBeNull();
  });
});

describe("cli adapters (injected exec — no real bw/op/security)", () => {
  it("bitwarden calls `bw get password <ref>`", async () => {
    const exec: ExecFn = vi.fn(async () => "bw-secret");
    const p = bitwardenProvider(exec);
    expect(await p.get("item-id")).toBe("bw-secret");
    expect(exec).toHaveBeenCalledWith("bw", ["get", "password", "item-id"]);
  });

  it("1password calls `op read <ref>`", async () => {
    const exec: ExecFn = vi.fn(async () => "op-secret");
    const p = onePasswordProvider(exec);
    expect(await p.get("op://vault/item/field")).toBe("op-secret");
    expect(exec).toHaveBeenCalledWith("op", ["read", "op://vault/item/field"]);
  });

  it("keychain calls `security find-generic-password -s <ref> -w`", async () => {
    const exec: ExecFn = vi.fn(async () => "kc-secret");
    const p = keychainProvider(exec);
    expect(await p.get("MY_SERVICE")).toBe("kc-secret");
    expect(exec).toHaveBeenCalledWith("security", ["find-generic-password", "-s", "MY_SERVICE", "-w"]);
  });

  it("caches a resolved secret (exec runs once across repeated gets)", async () => {
    const exec: ExecFn = vi.fn(async () => "cached");
    const p = bitwardenProvider(exec);
    expect(await p.get("ref")).toBe("cached");
    expect(await p.get("ref")).toBe("cached");
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("returns null and does not cache on exec failure (errors-as-values)", async () => {
    const exec: ExecFn = vi.fn(async () => null);
    const p = onePasswordProvider(exec);
    expect(await p.get("ref")).toBeNull();
    expect(await p.get("ref")).toBeNull();
    expect(exec).toHaveBeenCalledTimes(2); // not cached, so retried
  });
});

describe("getSecret", () => {
  it("prefers process.env over the configured backend", async () => {
    const exec: ExecFn = vi.fn(async () => "from-cli");
    const value = await getSecret("OPENAI_API_KEY", { OPENAI_API_KEY: "from-env", VANTA_SECRET_BACKEND: "bitwarden" }, exec);
    expect(value).toBe("from-env");
    expect(exec).not.toHaveBeenCalled();
  });

  it("falls through to the backend when env is unset", async () => {
    const exec: ExecFn = vi.fn(async () => "from-cli");
    const value = await getSecret("OPENAI_API_KEY", { VANTA_SECRET_BACKEND: "1password" }, exec);
    expect(value).toBe("from-cli");
    expect(exec).toHaveBeenCalledWith("op", ["read", "OPENAI_API_KEY"]);
  });

  it("uses the env backend by default", async () => {
    expect(await getSecret("FOO", { FOO: "bar" })).toBe("bar");
    expect(await getSecret("FOO", {})).toBeNull();
  });
});
