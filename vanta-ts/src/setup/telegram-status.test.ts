import { describe, expect, it, vi } from "vitest";
import { resolveTelegramSetupStatus } from "./telegram-status.js";

const NOW = Date.parse("2026-07-17T20:00:00.000Z");
const live = (status: "up" | "down" = "up") => ({
  version: 1 as const,
  updatedAt: new Date(NOW - 1_000).toISOString(),
  channels: [{ id: "telegram", status }],
});

describe("resolveTelegramSetupStatus", () => {
  it("returns one setup action when Telegram is unconfigured", async () => {
    const result = await resolveTelegramSetupStatus({}, "/tmp/vanta", { probe: vi.fn(), readReadiness: vi.fn(), now: () => NOW });
    expect(result).toMatchObject({ state: "unconfigured", action: { id: "configure", command: "vanta setup messaging telegram" } });
  });

  it("distinguishes configured credentials from a stopped gateway", async () => {
    const result = await resolveTelegramSetupStatus({ VANTA_TELEGRAM_TOKEN: "123:abc" }, "/tmp/vanta", {
      probe: async () => ({ ok: true, detail: "Telegram bot vanta_bot responded" }),
      readReadiness: async () => null,
      now: () => NOW,
    });
    expect(result).toMatchObject({ state: "stopped", action: { id: "start_gateway", command: "vanta gateway" } });
  });

  it("reports a live registered webhook channel", async () => {
    const result = await resolveTelegramSetupStatus({ VANTA_TELEGRAM_TOKEN: "123:abc", VANTA_TELEGRAM_WEBHOOK_SECRET: "hook" }, "/tmp/vanta", {
      probe: async () => ({ ok: true, detail: "Telegram bot vanta_bot responded" }),
      readReadiness: async () => live(),
      now: () => NOW,
    });
    expect(result).toMatchObject({ state: "webhook_live", action: { id: "inspect_gateway" } });
  });

  it("surfaces a down channel as one repair action", async () => {
    const result = await resolveTelegramSetupStatus({ VANTA_TELEGRAM_TOKEN: "123:abc" }, "/tmp/vanta", {
      probe: async () => ({ ok: true, detail: "Telegram bot vanta_bot responded" }),
      readReadiness: async () => live("down"),
      now: () => NOW,
    });
    expect(result).toMatchObject({ state: "needs_repair", action: { id: "inspect_gateway", command: "vanta gateway status" } });
  });
});
