import { describe, expect, it } from "vitest";
import { isTelegramSetupCommand, isTelegramSetupQuestion } from "./telegram-intent.js";

describe("Telegram setup intent", () => {
  it("recognizes the observed typo without matching unrelated Telegram requests", () => {
    expect(isTelegramSetupQuestion("how do i setup telgram i dont see the / command")).toBe(true);
    expect(isTelegramSetupQuestion("send this to Telegram")).toBe(false);
  });

  it("recognizes only the setup slash routes", () => {
    expect(isTelegramSetupCommand("/setup")).toBe(true);
    expect(isTelegramSetupCommand("/setup telegram")).toBe(true);
    expect(isTelegramSetupCommand("/setup model")).toBe(false);
  });
});
