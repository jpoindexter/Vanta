import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    expect(lines.join("\n")).toContain("authorized\t100 usd\tspend_approved");
    expect(lines.join("\n")).not.toContain("private");
    expect(await runPaymentsCommand(root, ["execute", "payment.json", "--approve", contract.id], { log: (line) => lines.push(line), now, provider })).toBe(1);
  });

  it("fails closed without echoing invalid contract contents", async () => {
    await writeFile(path, JSON.stringify({ ...contract, apiKey: "sk_live_never_echo" }), "utf8");
    expect(await runPaymentsCommand(root, ["preview", "payment.json"], { log: (line) => lines.push(line), now })).toBe(1);
    expect(lines.join("\n")).not.toContain("sk_live");
  });
});
