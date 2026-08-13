import { describe, expect, it } from "vitest";
import { isTelegramSetupCommand, isTelegramSetupQuestion, mentionsTelegramSetup, parseDesktopSetupCommand } from "./telegram-intent.js";

describe("desktop setup command routing", () => {
  it("keeps the setup hub distinct from Telegram setup", () => {
    expect(parseDesktopSetupCommand("/setup")).toEqual({ section: "overview" });
    expect(isTelegramSetupCommand("/setup")).toBe(false);
  });

  it("routes the supported setup destinations deterministically", () => {
    expect(parseDesktopSetupCommand("/setup telegram")).toEqual({ section: "messaging", platformId: "telegram" });
    expect(parseDesktopSetupCommand("/setup messaging")).toEqual({ section: "messaging" });
    expect(parseDesktopSetupCommand("/setup mcp")).toEqual({ section: "mcp" });
    expect(parseDesktopSetupCommand("/setup model")).toEqual({ section: "model" });
  });

  it("returns an actionable unknown destination", () => {
    expect(parseDesktopSetupCommand("/setup carrier-pigeon")).toEqual({ section: "unknown", value: "carrier-pigeon" });
    expect(parseDesktopSetupCommand("hello")).toBeNull();
  });

  it("routes direct setup and repair instructions without hijacking questions", () => {
    for (const text of ["set up telegram", "fix telegram", "repair telegram", "reconnect telgram"]) {
      expect(mentionsTelegramSetup(text)).toBe(true);
      expect(isTelegramSetupQuestion(text)).toBe(true);
    }
    for (const text of ["how do I set up telegram?", "what are the Telegram commands?", "can you repair Telegram?"]) {
      expect(mentionsTelegramSetup(text)).toBe(text !== "what are the Telegram commands?");
      expect(isTelegramSetupQuestion(text)).toBe(false);
    }
  });
});
