import { describe, expect, it } from "vitest";
import { isTelegramSetupCommand, parseDesktopSetupCommand } from "./telegram-intent.js";

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
});
