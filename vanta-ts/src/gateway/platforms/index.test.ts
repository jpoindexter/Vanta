import { describe, it, expect } from "vitest";
import { resolvePlatformAdapter } from "./index.js";

describe("resolvePlatformAdapter", () => {
  it("returns undefined when no platform is configured", () => {
    expect(resolvePlatformAdapter({})).toBeUndefined();
  });

  it("infers telegram from a configured token", () => {
    const a = resolvePlatformAdapter({ VANTA_TELEGRAM_TOKEN: "t" });
    expect(a?.id).toBe("telegram");
  });

  it("honors an explicit VANTA_MESSAGING_PLATFORM override", () => {
    const a = resolvePlatformAdapter({ VANTA_MESSAGING_PLATFORM: "telegram", VANTA_TELEGRAM_TOKEN: "t" });
    expect(a?.id).toBe("telegram");
  });

  it("infers signal when its url + number are set", () => {
    const a = resolvePlatformAdapter({ VANTA_SIGNAL_URL: "http://localhost:8080", VANTA_SIGNAL_NUMBER: "+1" });
    expect(a?.id).toBe("signal");
  });

  it("returns undefined for an unknown explicit platform", () => {
    expect(resolvePlatformAdapter({ VANTA_MESSAGING_PLATFORM: "nope" })).toBeUndefined();
  });
});
