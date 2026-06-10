import { describe, it, expect } from "vitest";
import { modelDeprecationNotice, modelDeprecationNotices } from "./model-deprecation.js";

const NOW = new Date("2026-06-10T00:00:00Z");

describe("modelDeprecationNotice", () => {
  it("returns a notice with the retirement date and replacement for a deprecated id", () => {
    const notice = modelDeprecationNotice("claude-2", NOW);
    expect(notice).toBe("model 'claude-2' is deprecated (retires 2025-07-21) — switch to claude-sonnet-4-6");
  });

  it("returns null for a current model id", () => {
    expect(modelDeprecationNotice("claude-sonnet-4-6", NOW)).toBeNull();
    expect(modelDeprecationNotice("gpt-5.5", NOW)).toBeNull();
  });

  it("matches when the configured id starts with a deprecated key", () => {
    const notice = modelDeprecationNotice("gpt-4-0314-preview", NOW);
    expect(notice).not.toBeNull();
    expect(notice).toContain("retires 2024-06-13");
    expect(notice).toContain("gpt-4-0314-preview");
  });

  it("matches case-insensitively", () => {
    const notice = modelDeprecationNotice("Claude-2.1", NOW);
    expect(notice).not.toBeNull();
    expect(notice).toContain("retires 2025-07-21");
  });
});

describe("modelDeprecationNotices", () => {
  it("reads VANTA_MODEL and returns the notice for a deprecated model", () => {
    const env = { VANTA_MODEL: "gemini-1.0-pro" } as unknown as NodeJS.ProcessEnv;
    const notices = modelDeprecationNotices(env, NOW);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("retires 2025-02-15");
  });

  it("returns [] when VANTA_MODEL is unset", () => {
    const env = {} as unknown as NodeJS.ProcessEnv;
    expect(modelDeprecationNotices(env, NOW)).toEqual([]);
  });

  it("returns [] when VANTA_MODEL is a current model", () => {
    const env = { VANTA_MODEL: "claude-sonnet-4-6" } as unknown as NodeJS.ProcessEnv;
    expect(modelDeprecationNotices(env, NOW)).toEqual([]);
  });
});
