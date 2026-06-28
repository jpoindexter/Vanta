import { describe, it, expect } from "vitest";
import { resolveBoxCredential } from "./autonomous-creds.js";

// How a Linux container authenticates without the host's macOS keychain (the env wall): resolve an
// explicit headless credential and forward it as env. Prefer what the user set; fall back to Vanta's
// existing claude-code resolver. The auth reader is injected so this is deterministic off any machine.
describe("resolveBoxCredential — env credential for the boxed agent", () => {
  it("prefers an explicit ANTHROPIC_API_KEY", () => {
    const c = resolveBoxCredential({ ANTHROPIC_API_KEY: "sk-test" } as NodeJS.ProcessEnv, () => null);
    expect(c).toEqual({ name: "ANTHROPIC_API_KEY", value: "sk-test" });
  });

  it("uses CLAUDE_CODE_OAUTH_TOKEN when no API key is set", () => {
    const c = resolveBoxCredential({ CLAUDE_CODE_OAUTH_TOKEN: "oauth-tok" } as NodeJS.ProcessEnv, () => null);
    expect(c).toEqual({ name: "CLAUDE_CODE_OAUTH_TOKEN", value: "oauth-tok" });
  });

  it("falls back to the resolved claude OAuth token (file/keychain) as CLAUDE_CODE_OAUTH_TOKEN", () => {
    const c = resolveBoxCredential({} as NodeJS.ProcessEnv, () => ({ token: "kc-tok" }));
    expect(c).toEqual({ name: "CLAUDE_CODE_OAUTH_TOKEN", value: "kc-tok" });
  });

  it("returns null when no credential is available anywhere", () => {
    expect(resolveBoxCredential({} as NodeJS.ProcessEnv, () => null)).toBeNull();
  });
});
