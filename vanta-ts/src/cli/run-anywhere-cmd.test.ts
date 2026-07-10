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
});
