import { describe, it, expect } from "vitest";
import {
  MESSAGING_CATALOG,
  messagingPlatformById,
  platformAvailability,
} from "./registry.js";

describe("messaging registry", () => {
  it("includes telegram as the one implemented platform", () => {
    const implemented = MESSAGING_CATALOG.filter((p) => p.implemented).map((p) => p.id);
    expect(implemented).toEqual(["telegram"]);
  });

  it("every entry has required env + at least one setup step", () => {
    for (const p of MESSAGING_CATALOG) {
      expect(p.requiredEnv.length).toBeGreaterThan(0);
      expect(p.setupSteps.length).toBeGreaterThan(0);
    }
  });

  it("looks a platform up by id", () => {
    expect(messagingPlatformById("telegram")?.label).toBe("Telegram");
    expect(messagingPlatformById("nope")).toBeUndefined();
  });

  it("reports telegram configured only when the token env is set", () => {
    const tg = messagingPlatformById("telegram")!;
    expect(platformAvailability(tg, {}).configured).toBe(false);
    expect(platformAvailability(tg, {}).missing).toEqual(["VANTA_TELEGRAM_TOKEN"]);
    expect(platformAvailability(tg, { VANTA_TELEGRAM_TOKEN: "123:abc" }).configured).toBe(true);
  });

  it("treats a blank env value as missing", () => {
    const tg = messagingPlatformById("telegram")!;
    expect(platformAvailability(tg, { VANTA_TELEGRAM_TOKEN: "   " }).configured).toBe(false);
  });

  it("warns on whatsapp (unofficial)", () => {
    expect(messagingPlatformById("whatsapp")?.warning).toMatch(/ban/i);
  });
});
