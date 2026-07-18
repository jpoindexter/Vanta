import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readVerifiedExternalAcceptance, recordExternalAcceptance } from "./external-acceptance.js";

const eventId = "00000000-0000-4000-8000-000000000003";

describe("external acceptance evidence", () => {
  it("copies, hashes, and re-verifies a real evidence artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-external-acceptance-"));
    const evidencePath = join(root, "shopify-redacted.json");
    await writeFile(evidencePath, '{"mutation":"verified"}\n');
    const result = await recordExternalAcceptance(root, {
      roadmapCardId: "HERMES-SHOPIFY-OPERATIONS",
      receiptEventIds: [eventId],
      evidencePath,
      now: new Date("2026-07-18T00:00:00.000Z"),
    });
    expect(result.packet.evidenceArtifact).toContain(".vanta/external-proofs/evidence/HERMES-SHOPIFY-OPERATIONS/");
    expect(await readVerifiedExternalAcceptance(root, "HERMES-SHOPIFY-OPERATIONS")).toEqual(result.packet);
  });

  it("rejects a packet after its copied evidence is changed", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-external-tamper-"));
    const evidencePath = join(root, "telephony-redacted.txt");
    await writeFile(evidencePath, "verified callback chain\n");
    const result = await recordExternalAcceptance(root, {
      roadmapCardId: "HERMES-TELEPHONY-CONSENT-LIFECYCLE",
      receiptEventIds: [eventId],
      evidencePath,
    });
    await writeFile(join(root, result.packet.evidenceArtifact), "changed\n");
    expect(await readVerifiedExternalAcceptance(root, "HERMES-TELEPHONY-CONSENT-LIFECYCLE")).toBeUndefined();
  });

  it("writes the packet as valid JSON with the exact receipt id", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-external-packet-"));
    const evidencePath = join(root, "payment-redacted.txt");
    await writeFile(evidencePath, "stripe test acceptance\n");
    const result = await recordExternalAcceptance(root, {
      roadmapCardId: "HERMES-PAYMENT-SKILL-PACK",
      receiptEventIds: [eventId, eventId],
      evidencePath,
    });
    const packet = JSON.parse(await readFile(result.packetPath, "utf8")) as { receiptEventIds: string[] };
    expect(packet.receiptEventIds).toEqual([eventId]);
  });

  it("records and verifies the standalone x402 settlement gate", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-external-x402-"));
    const evidencePath = join(root, "x402-redacted.json");
    await writeFile(evidencePath, '{"network":"eip155:84532","status":"settled"}\n');
    const result = await recordExternalAcceptance(root, {
      roadmapCardId: "PAYMENT-X402-TESTNET-RAIL",
      receiptEventIds: [eventId],
      evidencePath,
    });
    expect(await readVerifiedExternalAcceptance(root, "PAYMENT-X402-TESTNET-RAIL")).toEqual(result.packet);
  });
});
