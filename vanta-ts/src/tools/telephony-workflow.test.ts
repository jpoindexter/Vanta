import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildTelephonyWorkflowTool } from "./telephony-workflow.js";

const profile = { version: 1, environment: "test", provider: "twilio", accountSid: `AC${"1".repeat(32)}`, authTokenVaultAlias: "TWILIO_TEST_TOKEN", from: "+15005550006", scopes: ["numbers", "sms"] };
const contract = { version: 1, profile, id: "tel_tool_12345678", idempotencyKey: "00000000-0000-4000-8000-000000000001", action: "sms", recipient: "+15005550009", purpose: "test", consent: { source: "test", obtainedAt: "2026-07-11T10:00:00Z", expiresAt: "2099-07-12T00:00:00Z" }, window: { notBefore: "2026-07-11T11:00:00Z", notAfter: "2099-07-11T13:00:00Z" }, expiresAt: "2099-07-11T13:00:00Z", statusCallbackUrl: "https://callbacks.example/twilio", retention: { receiptDays: 30, transcriptDays: 0 }, body: "hello" };

describe("telephony_workflow tool", () => {
  it("searches safe number fields without approval", async () => {
    const requestApproval = vi.fn(), tool = buildTelephonyWorkflowTool({ search: async () => ({ ok: true, state: "ok", data: [{ phoneNumber: "+15005550010" }] }) });
    const result = await tool.execute({ action: "search_numbers", search: { profile, areaCode: "500" } }, { root: "/tmp", safety: {} as never, requestApproval });
    expect(result).toMatchObject({ ok: true }); expect(result.output).toContain("+15005550010"); expect(requestApproval).not.toHaveBeenCalled();
  });

  it("requires a fresh approval and stops cleanly on denial", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-tel-tool-")), requestApproval = vi.fn(async () => false), execute = vi.fn();
    const result = await buildTelephonyWorkflowTool({ execute }).execute({ action: "execute", contract }, { root, safety: {} as never, requestApproval });
    expect(result).toMatchObject({ ok: false }); expect(execute).not.toHaveBeenCalled();
    expect(requestApproval).toHaveBeenCalledWith(expect.stringContaining("target: +15005550009"), expect.any(String), "telephony_workflow", expect.objectContaining({ fresh: true }));
  });

  it("records an accepted action and exposes status without content", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-tel-tool-")), tool = buildTelephonyWorkflowTool({ execute: async () => ({ ok: true, state: "accepted", providerId: `SM${"a".repeat(32)}`, providerStatus: "queued" }) });
    expect((await tool.execute({ action: "execute", contract: { ...contract, id: "tel_tool_success1" } }, { root, safety: {} as never, requestApproval: async () => true })).ok).toBe(true);
    const status = await tool.execute({ action: "status" }, { root, safety: {} as never, requestApproval: async () => true });
    expect(status.output).toContain("queued"); expect(status.output).not.toContain("hello");
  });
});
