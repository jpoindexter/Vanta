import { describe, expect, it } from "vitest";
import { buildSafeChildEnv } from "./child-env.js";

describe("buildSafeChildEnv", () => {
  it("does not expose synthetic provider, Google, Gmail, or gateway credentials", () => {
    const child = buildSafeChildEnv({
      PATH: "/usr/bin",
      HOME: "/tmp/operator",
      OPENAI_API_KEY: "openai-secret",
      ANTHROPIC_API_KEY: "anthropic-secret",
      GOOGLE_ACCESS_TOKEN: "google-secret",
      VANTA_GMAIL_TOKEN: "gmail-secret",
      VANTA_TELEGRAM_TOKEN: "gateway-secret",
      AUTHORIZATION: "Bearer secret",
    });

    expect(child).toEqual({ PATH: "/usr/bin", HOME: "/tmp/operator" });
    expect(JSON.stringify(child)).not.toContain("secret");
  });
});
