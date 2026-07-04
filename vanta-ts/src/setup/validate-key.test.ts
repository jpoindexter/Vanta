import { describe, it, expect } from "vitest";
import { validateProviderKey } from "./validate-key.js";

const HINT = "https://platform.openai.com/api-keys";

describe("validateProviderKey — accepts the right shape per field", () => {
  it("accepts a real OpenAI sk- key", () => {
    expect(validateProviderKey("openai", "sk-proj-abc123DEF456ghi")).toEqual({ ok: true });
  });
  it("accepts a real Anthropic sk-ant- key", () => {
    expect(validateProviderKey("anthropic", "sk-ant-api03-abcDEF123")).toEqual({ ok: true });
  });
  it("accepts a real OpenRouter sk-or- key", () => {
    expect(validateProviderKey("openrouter", "sk-or-v1-abcdef012345")).toEqual({ ok: true });
  });
  it("accepts a real Google AIza key", () => {
    expect(validateProviderKey("gemini", "AIzaSyD-1234567890abcdef")).toEqual({ ok: true });
  });
});

describe("validateProviderKey — catches wrong-vendor pastes with a specific message", () => {
  it("flags a Slack xoxb token pasted for OpenAI, keeps the hint", () => {
    const r = validateProviderKey("openai", "xoxb-1111-2222-abcdEFGH", HINT);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("Slack");
    expect(r.message).toContain('start with "sk-"');
    expect(r.hint).toBe(HINT);
  });

  it("flags an Anthropic key pasted for OpenAI (sk-ant- beats sk-)", () => {
    const r = validateProviderKey("openai", "sk-ant-api03-xyz");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("Anthropic");
    expect(r.message).toContain('"sk-"');
  });

  it("flags an OpenAI key pasted for Anthropic", () => {
    const r = validateProviderKey("anthropic", "sk-proj-plainOpenAI");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("OpenAI");
    expect(r.message).toContain('"sk-ant-"');
  });

  it("flags a Telegram bot token pasted for gemini", () => {
    const r = validateProviderKey("gemini", "123456789:ABCdefGHIjklMNOpqrsTUVwxyz0123456789");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("Telegram");
  });
});

describe("validateProviderKey — catches malformed keys", () => {
  it("flags a non-key string for OpenAI with the expected prefix", () => {
    const r = validateProviderKey("openai", "hello world", HINT);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("OpenAI");
    expect(r.message).toContain('start with "sk-"');
    expect(r.hint).toBe(HINT);
  });

  it("flags an empty/whitespace key", () => {
    const r = validateProviderKey("openai", "   ");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("empty");
  });
});

describe("validateProviderKey — conservative: never blocks unenforced providers", () => {
  it("passes any key for a keyless/unenforced provider (ollama)", () => {
    expect(validateProviderKey("ollama", "anything")).toEqual({ ok: true });
  });
  it("passes any key for a router/custom provider (tokenrouter)", () => {
    expect(validateProviderKey("tokenrouter", "whatever-shape-xyz")).toEqual({ ok: true });
  });
  it("passes an unknown provider id untouched", () => {
    expect(validateProviderKey("some-new-provider", "sk-or-not")).toEqual({ ok: true });
  });
});
