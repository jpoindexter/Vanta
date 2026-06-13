import { describe, it, expect } from "vitest";
import { sessionConfig, sessionConfigEvent } from "./config-event.js";

describe("sessionConfig", () => {
  const opts = { provider: "openai", model: "gpt-5.5", contextWindow: 272000, tools: 65, systemPrompt: "you are vanta" };

  it("snapshots the resolved config with a prompt size + hash", () => {
    const c = sessionConfig(opts);
    expect(c).toMatchObject({ provider: "openai", model: "gpt-5.5", contextWindow: 272000, tools: 65, promptChars: 13 });
    expect(c.promptHash).toMatch(/^[0-9a-f]{12}$/);
  });

  it("is deterministic — the same prompt yields the same hash, a different one differs", () => {
    expect(sessionConfig(opts).promptHash).toBe(sessionConfig(opts).promptHash);
    expect(sessionConfig({ ...opts, systemPrompt: "different" }).promptHash).not.toBe(sessionConfig(opts).promptHash);
  });
});

describe("sessionConfigEvent", () => {
  it("serializes a session_config event line with a timestamp", () => {
    const cfg = sessionConfig({ provider: "openai", model: "gpt-5.5", contextWindow: 272000, tools: 65, systemPrompt: "x" });
    const parsed = JSON.parse(sessionConfigEvent(cfg, "2026-06-14T00:00:00Z"));
    expect(parsed).toMatchObject({ kind: "session_config", ts: "2026-06-14T00:00:00Z", provider: "openai", model: "gpt-5.5", tools: 65 });
    expect(parsed.promptHash).toMatch(/^[0-9a-f]{12}$/);
  });
});
