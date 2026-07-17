import { describe, expect, it, vi } from "vitest";
import { runSetupHandoff } from "./handoff.js";

describe("runSetupHandoff", () => {
  it("opens Telegram directly instead of returning to the platform menu", async () => {
    const messaging = vi.fn(async () => true);
    await expect(runSetupHandoff("/repo", { section: "messaging", platformId: "telegram" }, { messaging })).resolves.toBe(true);
    expect(messaging).toHaveBeenCalledWith("/repo", undefined, { platformId: "telegram" });
  });

  it("routes voice setup to the TTS wizard", async () => {
    const tts = vi.fn(async () => true);
    await expect(runSetupHandoff("/repo", { section: "tts" }, { tts })).resolves.toBe(true);
    expect(tts).toHaveBeenCalledWith("/repo", undefined);
  });
});
