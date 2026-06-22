import { describe, it, expect } from "vitest";
import { formatStatus, isDefaultConfig, resolveStatusCondensed, type StatusReport } from "./status.js";

const base: StatusReport = {
  kernel: { url: "http://127.0.0.1:7788", up: true },
  provider: { id: "gemini", ok: true, model: "gemini-2.5-flash", contextWindow: 1_000_000 },
  keys: [
    { envVar: "GEMINI_API_KEY", label: "Google Gemini", present: true },
    { envVar: "OPENAI_API_KEY", label: "OpenAI", present: false },
  ],
  store: { home: "/home/.vanta", skills: 3, memories: 5 },
  goals: { active: 2, total: 4 },
  notices: [],
};

describe("formatStatus", () => {
  it("renders kernel, provider, keys, store, and goals", () => {
    const out = formatStatus(base);
    expect(out).toContain("✓ kernel    up");
    expect(out).toContain("gemini · gemini-2.5-flash");
    expect(out).toContain("✓ GEMINI_API_KEY");
    expect(out).toContain("✗ OPENAI_API_KEY");
    expect(out).toContain("3 skill(s) · 5 memory file(s)");
    expect(out).toContain("2 active / 4 total");
  });

  it("shows an idle (not-yet-started) kernel as neutral, not a failure", () => {
    const out = formatStatus({
      ...base,
      kernel: { url: base.kernel.url, up: false },
      goals: { error: "kernel idle (starts on first run)" },
    });
    expect(out).toContain("○ kernel    idle — starts on first run");
    expect(out).not.toContain("✗ kernel");
    expect(out).toContain("goals     — kernel idle (starts on first run)");
  });

  it("shows the provider error when resolution fails", () => {
    const out = formatStatus({
      ...base,
      provider: { id: "gemini", ok: false, error: "GEMINI_API_KEY is not set" },
    });
    expect(out).toContain("✗ provider  gemini — GEMINI_API_KEY is not set");
  });

  it("never prints a key value — only presence", () => {
    const out = formatStatus(base);
    // the report carries no secret; assert the rendering exposes only env-var names
    expect(out).not.toMatch(/=[A-Za-z0-9]/);
  });

  it("renders auth-conflict notices when present, and nothing when empty", () => {
    expect(formatStatus(base)).not.toContain("notices:");
    const withNotice = formatStatus({ ...base, notices: ["Anthropic: ... remove one"] });
    expect(withNotice).toContain("⚠ notices:");
    expect(withNotice).toContain("remove one");
  });
});

describe("formatStatus condensed (STATUS-VERBOSITY-CONTEXT)", () => {
  it("drops the full per-provider key matrix, showing only the active provider's key", () => {
    const out = formatStatus(base, { condensed: true });
    expect(out).toContain("API key   ✓ GEMINI_API_KEY"); // active provider only
    expect(out).not.toContain("OPENAI_API_KEY"); // the rest of the matrix is gone
    expect(out).not.toContain("API keys:"); // no full matrix header
    expect(out).toContain("condensed — `vanta status --verbose`");
  });

  it("drops velocity in condensed mode but keeps it in full", () => {
    const withVel: StatusReport = { ...base, velocity: { captures: 9, ships: 1, ratio: 9, warn: true } };
    expect(formatStatus(withVel, { condensed: true })).not.toContain("velocity");
    expect(formatStatus(withVel)).toContain("velocity");
  });

  it("still keeps kernel, provider, store, goals, and notices when condensed", () => {
    const out = formatStatus({ ...base, notices: ["Anthropic: remove one"] }, { condensed: true });
    expect(out).toContain("✓ kernel    up");
    expect(out).toContain("gemini · gemini-2.5-flash");
    expect(out).toContain("2 active / 4 total");
    expect(out).toContain("⚠ notices:");
  });

  it("labels a local (keyless) provider's key line", () => {
    const local: StatusReport = { ...base, provider: { id: "ollama", ok: true, model: "qwen2.5:14b", contextWindow: 32_000 } };
    expect(formatStatus(local, { condensed: true })).toContain("API key   ollama — local, none needed");
  });
});

describe("isDefaultConfig", () => {
  it("is true when the provider runs its catalog default model", () => {
    expect(isDefaultConfig({ VANTA_PROVIDER: "ollama" } as NodeJS.ProcessEnv)).toBe(true); // qwen2.5:14b default
    expect(isDefaultConfig({ VANTA_PROVIDER: "ollama", VANTA_MODEL: "qwen2.5:14b" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isDefaultConfig({} as NodeJS.ProcessEnv)).toBe(true); // openai/gpt-4o-mini default
  });
  it("is false when a non-default model is selected", () => {
    expect(isDefaultConfig({ VANTA_PROVIDER: "ollama", VANTA_MODEL: "llama3.3" } as NodeJS.ProcessEnv)).toBe(false);
  });
  it("is false for an unknown provider", () => {
    expect(isDefaultConfig({ VANTA_PROVIDER: "made-up" } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("resolveStatusCondensed", () => {
  const def = { VANTA_PROVIDER: "ollama" } as NodeJS.ProcessEnv; // default config
  const nondef = { VANTA_PROVIDER: "ollama", VANTA_MODEL: "llama3.3" } as NodeJS.ProcessEnv;
  it("--verbose always wins → full", () => {
    expect(resolveStatusCondensed(nondef, { verbose: true, isTTY: true })).toBe(false);
    expect(resolveStatusCondensed(nondef, { verbose: true, isTTY: false })).toBe(false);
  });
  it("non-TTY (scripted) is condensed even on default config", () => {
    expect(resolveStatusCondensed(def, { verbose: false, isTTY: false })).toBe(true);
  });
  it("on a TTY: full for default config, condensed for non-default", () => {
    expect(resolveStatusCondensed(def, { verbose: false, isTTY: true })).toBe(false);
    expect(resolveStatusCondensed(nondef, { verbose: false, isTTY: true })).toBe(true);
  });
});
