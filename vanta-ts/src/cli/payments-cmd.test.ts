import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeychainRunner } from "../store/keychain.js";
import { runPaymentsCommand } from "./payments-cmd.js";

let root: string, lines: string[], path: string;
const now = () => new Date("2026-07-11T12:00:00Z");
const contract = {
  version: 1, environment: "test", id: "pay_cli_12345678", provider: "stripe_link",
  merchant: { name: "Merchant", url: "https://merchant.example" }, item: { name: "Item", quantity: 1 },
  currency: "usd", currencyExponent: 2, amountMinor: 100,
  caps: { perPurchaseMinor: 100, periodMinor: 500, period: "day" },
  credential: { type: "link_cli", storage: "provider_cli" }, expiresAt: "2026-07-12T00:00:00Z",
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-payments-cli-")); lines = []; path = join(root, "payment.json");
  await writeFile(path, JSON.stringify(contract), "utf8");
});

describe("vanta payments", () => {
  it("previews exact transaction terms", async () => {
    expect(await runPaymentsCommand(root, ["preview", "payment.json"], { log: (line) => lines.push(line), now })).toBe(0);
    expect(lines.join("\n")).toContain("exact total: 100 usd minor units");
  });

  it("requires the exact transaction ID and does not call a provider without it", async () => {
    const provider = vi.fn();
    expect(await runPaymentsCommand(root, ["execute", "payment.json", "--approve", "wrong"], { log: (line) => lines.push(line), now, provider })).toBe(1);
    expect(lines.join("\n")).toContain("--approve pay_cli_12345678");
    expect(provider).not.toHaveBeenCalled();
  });

  it("executes once with an exact token and lists redacted receipts", async () => {
    const provider = async () => ({ ok: true, state: "spend_approved", external: "approved" as const, providerId: "lsrq_private_12345678" });
    expect(await runPaymentsCommand(root, ["execute", "payment.json", "--approve", contract.id], { log: (line) => lines.push(line), now, provider })).toBe(0);
    lines = [];
    expect(await runPaymentsCommand(root, ["receipts"], { log: (line) => lines.push(line) })).toBe(0);
    expect(lines.join("\n")).toContain("authorized\t100 usd\tstripe_link\tdelegated_fiat\tspend_approved");
    expect(lines.join("\n")).not.toContain("private");
    lines = [];
    expect(await runPaymentsCommand(root, ["authorization"], { log: (line) => lines.push(line) })).toBe(0);
    expect(lines.join("\n")).toContain("receipt_recorded");
    expect(lines.join("\n")).toMatch(/[a-f0-9]{64}/);
    expect(await runPaymentsCommand(root, ["execute", "payment.json", "--approve", contract.id], { log: (line) => lines.push(line), now, provider })).toBe(1);
  });

  it("reports provider readiness as structured data", async () => {
    expect(await runPaymentsCommand(root, ["readiness", "--json"], {
      log: (line) => lines.push(line),
      env: { VANTA_PAYMENT_REGION: "ES", VANTA_PAYMENT_TEST_LINK_CLI: "/tmp/link-fixture" },
    })).toBe(0);
    const readiness = JSON.parse(lines.join("\n")) as Array<{ provider: string; state: string }>;
    expect(readiness.find((item) => item.provider === "stripe_link")?.state).toBe("unsupported_region");
    expect(readiness.find((item) => item.provider === "x402")?.state).toBe("ready");
  });

  it("previews then creates a Keychain-only x402 test wallet", async () => {
    const keychainRun = vi.fn<KeychainRunner>(async () => ({ ok: true, stdout: "" }));
    const privateKey = `0x${"11".repeat(32)}` as `0x${string}`;
    const deps = {
      log: (line: string) => lines.push(line),
      env: { VANTA_HOME: join(root, "home") },
      wallet: { platform: "darwin" as const, keychainRun, generateKey: () => privateKey },
    };
    expect(await runPaymentsCommand(root, ["x402-wallet", "create"], deps)).toBe(2);
    expect(keychainRun).not.toHaveBeenCalled();
    expect(await runPaymentsCommand(root, ["x402-wallet", "create", "--yes"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("alias X402_TEST_SIGNER");
    expect(lines.join("\n")).not.toContain(privateKey);
  });

  it("reports x402 wallet funding status as structured data", async () => {
    const privateKey = `0x${"11".repeat(32)}` as `0x${string}`;
    expect(await runPaymentsCommand(root, ["x402-wallet", "status", "--json"], {
      log: (line) => lines.push(line),
      wallet: { resolveSecret: async () => privateKey, readBalance: async () => 20_000_000n },
    })).toBe(0);
    const status = JSON.parse(lines.join("\n")) as { state: string; balanceUsdc: string; address: string };
    expect(status).toMatchObject({ state: "funded", balanceUsdc: "20" });
    expect(status.address).toMatch(/^0x[0-9A-Fa-f]{40}$/);
    expect(lines.join("\n")).not.toContain(privateKey);
  });

  it("fails closed without echoing invalid contract contents", async () => {
    await writeFile(path, JSON.stringify({ ...contract, apiKey: "sk_live_never_echo" }), "utf8");
    expect(await runPaymentsCommand(root, ["preview", "payment.json"], { log: (line) => lines.push(line), now })).toBe(1);
    expect(lines.join("\n")).not.toContain("sk_live");
  });
});
