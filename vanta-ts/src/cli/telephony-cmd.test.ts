import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runTelephonyCommand } from "./telephony-cmd.js";

let root: string, lines: string[];
const profile = { version: 1, environment: "test", provider: "twilio", accountSid: `AC${"1".repeat(32)}`, authTokenVaultAlias: "TWILIO_TEST_TOKEN", from: "+15005550006", scopes: ["numbers", "sms"] };
const contract = { version: 1, profile, id: "tel_cli_12345678", idempotencyKey: "00000000-0000-4000-8000-000000000001", action: "sms", recipient: "+15005550009", purpose: "test", consent: { source: "test", obtainedAt: "2026-07-11T10:00:00Z", expiresAt: "2099-07-12T00:00:00Z" }, window: { notBefore: "2026-07-11T11:00:00Z", notAfter: "2099-07-11T13:00:00Z" }, expiresAt: "2099-07-11T13:00:00Z", statusCallbackUrl: "https://callbacks.example/twilio", retention: { receiptDays: 30, transcriptDays: 0 }, body: "hello" };
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "vanta-tel-cli-")); lines = []; await writeFile(join(root, "profile.json"), JSON.stringify(profile)); await writeFile(join(root, "action.json"), JSON.stringify(contract)); });

describe("vanta telephony", () => {
  it("searches numbers without approval", async () => {
    const search = vi.fn(async () => ({ ok: true, state: "ok", data: [{ phoneNumber: "+15005550010" }] }));
    expect(await runTelephonyCommand(root, ["search", "profile.json", "--area", "500"], { log: (line) => lines.push(line), search })).toBe(0); expect(search).toHaveBeenCalled();
  });
  it("requires exact action ID before execution", async () => {
    const execute = vi.fn(); expect(await runTelephonyCommand(root, ["execute", "action.json", "--approve", "wrong"], { log: (line) => lines.push(line), execute })).toBe(1); expect(execute).not.toHaveBeenCalled(); expect(lines.join("\n")).toContain("--approve tel_cli_12345678");
  });
  it("executes once and lists lifecycle state", async () => {
    const execute = async () => ({ ok: true, state: "accepted", providerId: `SM${"a".repeat(32)}`, providerStatus: "queued" });
    expect(await runTelephonyCommand(root, ["execute", "action.json", "--approve", contract.id], { log: (line) => lines.push(line), execute })).toBe(0); lines = [];
    expect(await runTelephonyCommand(root, ["receipts"], { log: (line) => lines.push(line) })).toBe(0); expect(lines.join("\n")).toContain("queued");
  });
});
