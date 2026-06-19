import { describe, it, expect } from "vitest";
import { resolvePlatform } from "./resolve.js";

describe("resolvePlatform", () => {
  it("returns undefined when no messaging platform is configured", () => {
    expect(resolvePlatform({})).toBeUndefined();
  });

  it("selects the Telegram adapter when a bot token is set", () => {
    const adapter = resolvePlatform({ VANTA_TELEGRAM_TOKEN: "123:abc" });
    expect(adapter?.id).toBe("telegram");
  });

  it("selects the ntfy adapter when a topic is set and no Telegram token", () => {
    const adapter = resolvePlatform({ VANTA_NTFY_TOPIC: "my-topic" });
    expect(adapter?.id).toBe("ntfy");
  });

  it("prefers Telegram over ntfy when both are configured", () => {
    const adapter = resolvePlatform({ VANTA_TELEGRAM_TOKEN: "123:abc", VANTA_NTFY_TOPIC: "my-topic" });
    expect(adapter?.id).toBe("telegram");
  });

  it("treats a blank topic as not configured", () => {
    expect(resolvePlatform({ VANTA_NTFY_TOPIC: "   " })).toBeUndefined();
  });
});
