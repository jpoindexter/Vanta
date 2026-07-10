import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runRunAnywhereCommand } from "./run-anywhere-cmd.js";
import { appendChannelProof } from "../gateway/channel-proof.js";
import { writeGatewayReceipt } from "../exec/modal-gateway-state.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-run-anywhere-cmd-"));
  roots.push(root);
  return root;
}

describe("run-anywhere command", () => {
  it("prints missing proof status and exits non-zero", async () => {
    const root = await workspace();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(runRunAnywhereCommand(root, ["status"])).resolves.toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Run Anywhere readiness: not ready"));
  });

  it("prints structured next actions in json mode", async () => {
    const root = await workspace();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(runRunAnywhereCommand(root, ["status", "--json"])).resolves.toBe(1);
    const report = JSON.parse(String(log.mock.calls[0]?.[0])) as { gates: Array<{ id: string; nextActions: string[] }> };
    expect(report.gates.find((gate) => gate.id === "serverless-live")?.nextActions).toContain("vanta backend gateway status --json");
    expect(report.gates.find((gate) => gate.id === "teams-round-trip")?.nextActions).toContain("vanta gateway channel-proofs teams --json");
    expect(report.gates.find((gate) => gate.id === "termux-arm64")?.nextActions).toContain("scripts/termux-arm64-device-proof.sh --require-release-kernel");
  });

  it("prints a proof packet without claiming readiness", async () => {
    const root = await workspace();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(runRunAnywhereCommand(root, ["proof-packet"])).resolves.toBe(0);
    const out = String(log.mock.calls[0]?.[0]);
    expect(out).toContain("Run Anywhere proof packet: not ready (0/3)");
    expect(out).toContain("BACKEND-SERVERLESS-LIVE / serverless-live");
    expect(out).toContain("receipt: .vanta/serverless-gateway.json");
    expect(out).toContain("vanta backend gateway deploy");
    expect(out).toContain("setup guidance only");
  });

  it("prints a structured proof packet in json mode", async () => {
    const root = await workspace();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(runRunAnywhereCommand(root, ["proof-packet", "--json"])).resolves.toBe(0);
    const packet = JSON.parse(String(log.mock.calls[0]?.[0])) as { ready: boolean; steps: Array<{ roadmapCardId: string; receiptPath: string; commands: string[] }> };
    expect(packet.ready).toBe(false);
    expect(packet.steps.map((step) => step.roadmapCardId)).toEqual([
      "BACKEND-SERVERLESS-LIVE",
      "MSG-ADAPTER-TEAMS",
      "RUN-ANYWHERE-TERMUX",
    ]);
    expect(packet.steps.find((step) => step.roadmapCardId === "RUN-ANYWHERE-TERMUX")?.receiptPath).toBe(".vanta/termux-arm64-proof.txt");
    expect(packet.steps.find((step) => step.roadmapCardId === "MSG-ADAPTER-TEAMS")?.commands).toContain("vanta gateway channel-proofs teams --json");
  });

  it("prints json and exits zero when all receipts exist", async () => {
    const root = await workspace();
    await writeGatewayReceipt(root, { app: "vanta-gateway", volume: "vanta-gateway-data", provedAt: "2026-07-10T12:00:00.000Z", telegramAcceptedAt: "2026-07-10T12:00:01.000Z" });
    await appendChannelProof(join(root, ".vanta"), { kind: "channel-round-trip", platform: "teams", transport: "bot-connector", conversationHash: "h", parts: 1, acceptedAt: "2026-07-10T12:00:02.000Z" });
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(join(root, ".vanta", "termux-arm64-proof.txt"), "TERMUX_ARM64_E2E_OK release_kernel=1 abi=arm64-v8a\n");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(runRunAnywhereCommand(root, ["status", "--json"])).resolves.toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"ready": true'));
  });

  it("prints release asset check when requested", async () => {
    const root = await workspace();
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ tag_name: "v0.8.0", assets: [] }), { status: 200 })) as typeof fetch;
    try {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      await expect(runRunAnywhereCommand(root, ["status", "--check-release"])).resolves.toBe(1);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("Android release asset check: not ready"));
      expect(log).toHaveBeenCalledWith(expect.stringContaining("vanta-kernel-aarch64-linux-android"));
    } finally {
      globalThis.fetch = original;
    }
  });

  it("can add the release check to a proof packet without making it a readiness gate", async () => {
    const root = await workspace();
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ tag_name: "v0.8.0", assets: [] }), { status: 200 })) as typeof fetch;
    try {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      await expect(runRunAnywhereCommand(root, ["proof-packet", "--check-release"])).resolves.toBe(0);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("Run Anywhere proof packet: not ready"));
      expect(log).toHaveBeenCalledWith(expect.stringContaining("Android release asset check: not ready"));
    } finally {
      globalThis.fetch = original;
    }
  });
});
