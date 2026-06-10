import { describe, it, expect } from "vitest";
import { authConflictNotices } from "./auth-conflict.js";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe("authConflictNotices (auth-conflict notice)", () => {
  it("flags Anthropic key + Claude OAuth both active", () => {
    const n = authConflictNotices(env({ ANTHROPIC_API_KEY: "sk-x" }), { claude: true, codex: false });
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("ANTHROPIC_API_KEY");
    expect(n[0]).toContain("remove one");
  });

  it("flags OpenAI key + Codex OAuth both active", () => {
    const n = authConflictNotices(env({ OPENAI_API_KEY: "sk-y" }), { claude: false, codex: true });
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("OPENAI_API_KEY");
  });

  it("flags both conflicts at once", () => {
    const n = authConflictNotices(env({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "b" }), { claude: true, codex: true });
    expect(n).toHaveLength(2);
  });

  it("is silent when only the key is set (no OAuth)", () => {
    expect(authConflictNotices(env({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "b" }), { claude: false, codex: false })).toEqual([]);
  });

  it("is silent when only OAuth is present (no key)", () => {
    expect(authConflictNotices(env({}), { claude: true, codex: true })).toEqual([]);
  });

  it("treats a whitespace-only key as unset", () => {
    expect(authConflictNotices(env({ ANTHROPIC_API_KEY: "   " }), { claude: true, codex: false })).toEqual([]);
  });
});
