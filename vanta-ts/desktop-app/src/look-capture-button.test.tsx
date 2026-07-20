import { describe, expect, it } from "vitest";
import { desktopLookCommand } from "./look-capture-button.js";

describe("desktop /look command", () => {
  it("defaults to marquee and accepts explicit capture modes", () => {
    expect(desktopLookCommand("/look")).toBe("marquee");
    expect(desktopLookCommand("/look selection")).toBe("marquee");
    expect(desktopLookCommand("/look window")).toBe("window");
    expect(desktopLookCommand("/look full")).toBe("screen");
  });

  it("does not intercept unrelated messages", () => {
    expect(desktopLookCommand("look at this code")).toBeUndefined();
    expect(desktopLookCommand("/look camera")).toBeUndefined();
  });
});
