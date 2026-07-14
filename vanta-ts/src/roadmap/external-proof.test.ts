import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PaymentReceipt } from "../payments/ledger.js";
import type { RunAnywhereReadiness } from "../run-anywhere/readiness.js";
import type { ShopifyReceipt } from "../shopify/receipts.js";
import type { TelephonyReceipt } from "../telephony/receipts.js";
import { assessExternalProofReadiness, externalProofAcceptanceTemplate, formatExternalProofAcceptanceTemplate, formatExternalProofReadiness, readExternalProofReadiness } from "./external-proof.js";

function remote(ready: boolean): RunAnywhereReadiness {
  const ids = [
    ["BACKEND-SERVERLESS-LIVE", "serverless-live"],
    ["MSG-ADAPTER-TEAMS", "teams-round-trip"],
    ["RUN-ANYWHERE-TERMUX", "termux-arm64"],
  ] as const;
  return {
    ready, passed: ready ? 3 : 0, total: 3,
    gates: ids.map(([roadmapCardId, id]) => ({ id, roadmapCardId, ready, label: id, receiptPath: `.vanta/${id}`, evidence: ready ? "ready" : "missing", next: "next", nextActions: ["next"] })),
  };
}

const ids = {
  link: "00000000-0000-4000-8000-000000000001", mpp: "00000000-0000-4000-8000-000000000002",
  shopify: "00000000-0000-4000-8000-000000000003", number: "00000000-0000-4000-8000-000000000004",
  sms: "00000000-0000-4000-8000-000000000005", call: "00000000-0000-4000-8000-000000000006",
  deletion: "00000000-0000-4000-8000-000000000007",
};
const payment = (eventId: string, provider: "stripe_link" | "mpp", status: "authorized" | "settled") => ({ eventId, provider, status, approval: { external: "approved" }, providerResult: { httpStatus: 200 } }) as PaymentReceipt;
const shopify = { eventId: ids.shopify, status: "verified", verified: true, userErrorCount: 0, operation: "product_update", store: "dev.myshopify.com" } as ShopifyReceipt;
const phone = (eventId: string, action: "number_provision" | "sms" | "call", status: "accepted" | "callback", extra = {}) => ({ eventId, action, status, ...extra }) as TelephonyReceipt;
const acceptance = (roadmapCardId: string, receiptEventIds: string[]) => ({ version: 1, ok: true, roadmapCardId, environment: "external-test", executedAt: "2026-07-11T00:00:00.000Z", evidenceSha256: "a".repeat(64), receiptEventIds });

describe("external proof readiness", () => {
  it("reports all ten gates with concrete next actions when evidence is absent", () => {
    const report = assessExternalProofReadiness({ runAnywhere: remote(false), payments: [], shopify: [], telephony: [] });
    expect(report).toMatchObject({ ready: false, passed: 0, total: 10 });
    expect(report.gates.map((gate) => gate.roadmapCardId)).toContain("HERMES-COMMERCE-TELEPHONY-SKILL-PACK");
    expect(report.gates.find((gate) => gate.roadmapCardId === "BACKEND-SERVERLESS-LIVE")?.nextActions).toEqual(["next"]);
    const out = formatExternalProofReadiness(report);
    expect(out).toContain("VANTA_PAYMENT_TEST_LINK_CLI");
    expect(out).toContain("service-proof-win32.json");
    expect(out).toContain("canonical receipts");
  });

  it("marks all gates ready only when every child receipt criterion is present", () => {
    const report = assessExternalProofReadiness({
      runAnywhere: remote(true),
      spreadsheetHost: { ok: true, host: "excel", workbookReceipt: ".vanta/spreadsheet/receipts/action.json", approvalGatedAction: true, executedAt: "2026-07-11T00:00:00.000Z", apiSessionId: "excel-session", evidenceSha256: "b".repeat(64) },
      spreadsheetWorkbookReceiptExists: true,
      windowsService: { ok: true, platform: "win32", logCaptured: true },
      payments: [payment(ids.link, "stripe_link", "authorized"), payment(ids.mpp, "mpp", "settled")],
      paymentAcceptance: acceptance("HERMES-PAYMENT-SKILL-PACK", [ids.link, ids.mpp]),
      shopify: [shopify], shopifyAcceptance: acceptance("HERMES-SHOPIFY-OPERATIONS", [ids.shopify]),
      telephony: [
        phone(ids.number, "number_provision", "accepted"), phone(ids.sms, "sms", "callback", { callbackRank: 2 }),
        phone(ids.call, "call", "callback", { callbackRank: 2 }), phone(ids.deletion, "call", "callback", { providerStatus: "recording_deleted" }),
      ],
      telephonyAcceptance: acceptance("HERMES-TELEPHONY-CONSENT-LIFECYCLE", [ids.number, ids.sms, ids.call, ids.deletion]),
    });
    expect(report).toMatchObject({ ready: true, passed: 10, total: 10 });
    expect(report.gates.every((gate) => gate.nextActions.length === 0)).toBe(true);
  });

  it("does not promote provider fixture candidates without external packets", () => {
    const report = assessExternalProofReadiness({
      runAnywhere: remote(false),
      payments: [payment(ids.link, "stripe_link", "authorized"), payment(ids.mpp, "mpp", "settled")],
      shopify: [shopify],
      telephony: [],
    });
    expect(report.gates.find((gate) => gate.roadmapCardId === "HERMES-PAYMENT-SKILL-PACK")).toMatchObject({ ready: false, evidence: expect.stringContaining("external packet missing") });
    expect(report.gates.find((gate) => gate.roadmapCardId === "HERMES-SHOPIFY-OPERATIONS")?.ready).toBe(false);
  });

  it("refuses a spreadsheet host packet whose workbook receipt escapes the repo", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-external-proof-"));
    const packetPath = join(root, ".vanta", "spreadsheet", "host-proof.json");
    await mkdir(dirname(packetPath), { recursive: true });
    await writeFile(join(root, "..", "outside-receipt.json"), "{}\n");
    await writeFile(packetPath, JSON.stringify({ ok: true, host: "excel", workbookReceipt: "../outside-receipt.json", approvalGatedAction: true, executedAt: "2026-07-11T00:00:00.000Z", apiSessionId: "excel", evidenceSha256: "c".repeat(64) }));
    const report = await readExternalProofReadiness(root);
    expect(report.gates.find((gate) => gate.roadmapCardId === "HERMES-SPREADSHEET-COPILOT")?.ready).toBe(false);
  });

  it("prints acceptance packet templates for packet-based external proof cards", () => {
    const template = externalProofAcceptanceTemplate("HERMES-SHOPIFY-OPERATIONS", [ids.shopify], "2026-07-14T00:00:00.000Z");
    expect(template).toEqual({
      roadmapCardId: "HERMES-SHOPIFY-OPERATIONS",
      receiptPath: ".vanta/external-proofs/HERMES-SHOPIFY-OPERATIONS.json",
      template: {
        version: 1,
        ok: true,
        roadmapCardId: "HERMES-SHOPIFY-OPERATIONS",
        environment: "external-test",
        executedAt: "2026-07-14T00:00:00.000Z",
        evidenceSha256: "<64-lowercase-hex-redacted-evidence-sha256>",
        receiptEventIds: [ids.shopify],
      },
    });
    expect(formatExternalProofAcceptanceTemplate(template!)).toContain("write to: .vanta/external-proofs/HERMES-SHOPIFY-OPERATIONS.json");
    expect(externalProofAcceptanceTemplate("BACKEND-SERVERLESS-LIVE")).toBeNull();
  });
});
