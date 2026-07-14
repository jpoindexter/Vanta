import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendChannelProof } from "../gateway/channel-proof.js";
import { writeGatewayReceipt } from "../exec/modal-gateway-state.js";
import { formatRunAnywhereReadiness, readRunAnywhereReadiness } from "./readiness.js";

const roots: string[] = [];
const VALID_TELEGRAM_ENV = {
  VANTA_TELEGRAM_TOKEN: "123456789:abcdefghijklmnopqrstuvwxyzABCDE_12345",
  VANTA_TELEGRAM_WEBHOOK_SECRET: "distinct-webhook-secret",
};

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-run-anywhere-"));
  roots.push(root);
  return root;
}

describe("Run Anywhere readiness", () => {
  it("reports missing proof gates without treating setup receipts as release proof", async () => {
    const root = await workspace();
    await writeGatewayReceipt(root, { app: "vanta-gateway", volume: "vanta-gateway-data", endpoint: "https://example.modal.run/telegram/webhook" });
    const report = await readRunAnywhereReadiness(root, VALID_TELEGRAM_ENV);
    expect(report).toMatchObject({ ready: false, passed: 0, total: 3 });
    expect(report.gates.map((gate) => gate.roadmapCardId)).toEqual([
      "BACKEND-SERVERLESS-LIVE",
      "MSG-ADAPTER-TEAMS",
      "RUN-ANYWHERE-TERMUX",
    ]);
    expect(report.gates.map((gate) => gate.receiptPath)).toEqual([
      ".vanta/serverless-gateway.json",
      ".vanta/channel-proofs.jsonl",
      ".vanta/termux-arm64-proof.txt",
    ]);
    expect(formatRunAnywhereReadiness(report)).toContain("deployed endpoint receipt exists");
    expect(formatRunAnywhereReadiness(report)).toContain("Release gate stays parked");
    const serverless = report.gates.find((gate) => gate.id === "serverless-live");
    expect(serverless?.nextActions).not.toContain("vanta backend gateway deploy");
    expect(serverless?.nextActions).toContain("vanta backend gateway register-telegram <https-endpoint>");
  });

  it("surfaces invalid Telegram setup before suggesting arm or prove", async () => {
    const root = await workspace();
    await writeGatewayReceipt(root, { app: "vanta-gateway", volume: "vanta-gateway-data", endpoint: "https://example.modal.run/telegram/webhook" });
    const report = await readRunAnywhereReadiness(root, {
      VANTA_TELEGRAM_TOKEN: "not-a-botfather-token",
      VANTA_TELEGRAM_WEBHOOK_SECRET: "distinct-webhook-secret",
    });
    const serverless = report.gates.find((gate) => gate.id === "serverless-live");
    expect(serverless?.evidence).toContain("Telegram token invalid-format (missing-colon); webhook secret present");
    expect(serverless?.nextActions).toContain("replace VANTA_TELEGRAM_TOKEN with a valid BotFather token (diagnostic: missing-colon)");
    expect(serverless?.nextActions).toContain("vanta backend gateway register-telegram <https-endpoint>");
    expect(serverless?.nextActions).not.toContain("vanta backend gateway arm");
    expect(serverless?.nextActions).not.toContain("send one real Telegram message to the bot");
    expect(serverless?.nextActions).not.toContain("vanta backend gateway prove");
  });

  it("only asks for the live message and prove step after the gateway is armed", async () => {
    const root = await workspace();
    await writeGatewayReceipt(root, {
      app: "vanta-gateway",
      volume: "vanta-gateway-data",
      endpoint: "https://example.modal.run",
      telegramRegisteredAt: "2026-07-13T12:00:00.000Z",
      armedAt: "2026-07-13T12:01:00.000Z",
    });
    const report = await readRunAnywhereReadiness(root, VALID_TELEGRAM_ENV);
    const serverless = report.gates.find((gate) => gate.id === "serverless-live");
    expect(serverless?.nextActions).toEqual([
      "vanta backend gateway status --json",
      "send one real Telegram message to the bot",
      "vanta backend gateway prove",
    ]);
  });

  it("requires serverless prove, Teams proof, and ARM64 release-kernel proof", async () => {
    const root = await workspace();
    await writeGatewayReceipt(root, {
      app: "vanta-gateway",
      volume: "vanta-gateway-data",
      provedAt: "2026-07-10T12:02:00.000Z",
      telegramAcceptedAt: "2026-07-10T12:01:00.000Z",
      telegramParts: 1,
    });
    await appendChannelProof(join(root, ".vanta"), {
      kind: "channel-round-trip",
      platform: "teams",
      transport: "bot-connector",
      conversationHash: "hash",
      parts: 1,
      acceptedAt: "2026-07-10T12:03:00.000Z",
    });
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(join(root, ".vanta", "termux-arm64-proof.txt"), "TERMUX_ARM64_E2E_OK release_kernel=1 abi=arm64-v8a\n");
    const report = await readRunAnywhereReadiness(root, VALID_TELEGRAM_ENV);
    expect(report).toMatchObject({ ready: true, passed: 3, total: 3 });
    expect(formatRunAnywhereReadiness(report)).toContain("Run Anywhere readiness: ready (3/3)");
  });

  it("does not accept a non-release-kernel Termux proof for the final gate", async () => {
    const root = await workspace();
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(join(root, ".vanta", "termux-arm64-proof.txt"), "TERMUX_ARM64_E2E_OK release_kernel=0 abi=arm64-v8a\n");
    const report = await readRunAnywhereReadiness(root, VALID_TELEGRAM_ENV);
    const termux = report.gates.find((gate) => gate.id === "termux-arm64");
    expect(termux).toMatchObject({ ready: false });
    expect(termux?.evidence).toContain("release-kernel proof missing");
  });
});
