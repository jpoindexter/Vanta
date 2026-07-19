import { describe, expect, it, vi } from "vitest";
import { latestTelegramReceipt, RELEASE_PROOFS_USAGE, runReleaseProofsCommand } from "./release-proofs-cmd.js";

describe("release-proofs command", () => {
  it("requires explicit consent before live account calls", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runReleaseProofsCommand("/unused", ["capture", "codex"])).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith(RELEASE_PROOFS_USAGE);

    error.mockRestore();
  });

  it("rejects unknown account ids without throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runReleaseProofsCommand("/unused", ["capture", "unknown", "--yes"])).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith(RELEASE_PROOFS_USAGE);

    error.mockRestore();
  });

  it("uses the deployed gateway receipt when Telegram is served by a webhook", () => {
    expect(latestTelegramReceipt([], {
      app: "vanta-gateway",
      volume: "vanta-gateway-data",
      endpoint: "https://owner--gateway.modal.run/telegram/webhook",
      provedAt: "2026-07-19T10:00:05.000Z",
      telegramAcceptedAt: "2026-07-19T10:00:00.000Z",
      telegramParts: 2,
    })).toMatchObject({
      acceptedAt: "2026-07-19T10:00:00.000Z",
      parts: 2,
    });
  });

  it("prefers the newer accepted Telegram receipt across local and deployed gateways", () => {
    const result = latestTelegramReceipt([{
      kind: "channel-round-trip",
      platform: "telegram",
      transport: "bot-api",
      conversationHash: "local-conversation",
      parts: 1,
      acceptedAt: "2026-07-19T10:00:00.000Z",
    }], {
      app: "vanta-gateway",
      volume: "vanta-gateway-data",
      provedAt: "2026-07-19T10:01:05.000Z",
      telegramAcceptedAt: "2026-07-19T10:01:00.000Z",
      telegramParts: 3,
    });

    expect(result).toMatchObject({ acceptedAt: "2026-07-19T10:01:00.000Z", parts: 3 });
  });

  it("uses the newest receipt from the deployed Modal volume without requiring scale-down", () => {
    const result = latestTelegramReceipt([], {
      app: "vanta-gateway",
      volume: "vanta-gateway-data",
      telegramAcceptedAt: "2026-07-19T10:00:00.000Z",
      provedAt: "2026-07-19T10:00:05.000Z",
      telegramParts: 1,
    }, [{
      kind: "channel-round-trip",
      platform: "telegram",
      transport: "bot-api",
      conversationHash: "deployed-conversation",
      inboundHash: "deployed-inbound",
      parts: 1,
      acceptedAt: "2026-07-19T10:02:00.000Z",
    }]);

    expect(result).toMatchObject({ acceptedAt: "2026-07-19T10:02:00.000Z", parts: 1 });
  });
});
