import { describe, it, expect } from "vitest";
import { formatStatus, type StatusReport } from "./status.js";

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
