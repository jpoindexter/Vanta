import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isTokenExpired, readClaudeCodeAuth, resolveClaudeCodeToken } from "./claude-code-auth.js";

// Tests inject a keychain reader so they never touch the real macOS keychain
// (which, on a dev machine logged into Claude Code, would otherwise resolve a
// real token and break the "nothing configured" assertions).
const noKeychain = () => null;
const blob = (accessToken: string, expiresAt?: number): string =>
  JSON.stringify({ claudeAiOauth: { accessToken, ...(expiresAt !== undefined ? { expiresAt } : {}) } });

describe("isTokenExpired", () => {
  const now = 1_000_000;
  it("is true for a past expiry", () => expect(isTokenExpired(now - 1, now)).toBe(true));
  it("is false for a future expiry", () => expect(isTokenExpired(now + 1, now)).toBe(false));
  it("is false when expiry is unknown", () => expect(isTokenExpired(undefined, now)).toBe(false));
});

describe("readClaudeCodeAuth", () => {
  it("prefers an explicit env token", () => {
    expect(readClaudeCodeAuth({ CLAUDE_CODE_OAUTH_TOKEN: "tok-1" } as NodeJS.ProcessEnv, noKeychain)).toEqual({
      token: "tok-1",
    });
    expect(readClaudeCodeAuth({ ANTHROPIC_AUTH_TOKEN: "tok-2" } as NodeJS.ProcessEnv, noKeychain)).toEqual({
      token: "tok-2",
    });
  });

  it("returns null when nothing is configured", () => {
    expect(readClaudeCodeAuth({ CLAUDE_CONFIG_DIR: "/nope-xyz" } as NodeJS.ProcessEnv, noKeychain)).toBeNull();
  });

  it("reads from the macOS keychain when no env token and no creds file", () => {
    // The real bug: modern Claude Code stores creds in the keychain, not the file.
    const auth = readClaudeCodeAuth(
      { CLAUDE_CONFIG_DIR: "/nope-xyz" } as NodeJS.ProcessEnv,
      () => blob("kc-token", 42),
    );
    expect(auth).toEqual({ token: "kc-token", expiresAt: 42 });
  });

  it("an env token beats the keychain", () => {
    expect(
      readClaudeCodeAuth({ CLAUDE_CODE_OAUTH_TOKEN: "env-tok" } as NodeJS.ProcessEnv, () => blob("kc-token", 42)),
    ).toEqual({ token: "env-tok" });
  });

  it("returns null when the keychain blob is shapeless", () => {
    expect(readClaudeCodeAuth({ CLAUDE_CONFIG_DIR: "/nope" } as NodeJS.ProcessEnv, () => "not-json")).toBeNull();
  });
});

describe("readClaudeCodeAuth from the credentials file", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-claude-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads accessToken + expiresAt from ~/.claude/.credentials.json", async () => {
    await writeFile(join(dir, ".credentials.json"), blob("sk-ant-oat01-x", 42));
    const auth = readClaudeCodeAuth({ CLAUDE_CONFIG_DIR: dir } as NodeJS.ProcessEnv, noKeychain);
    expect(auth).toEqual({ token: "sk-ant-oat01-x", expiresAt: 42 });
  });

  it("the creds file beats the keychain when both exist", async () => {
    await writeFile(join(dir, ".credentials.json"), blob("file-token", 42));
    const auth = readClaudeCodeAuth({ CLAUDE_CONFIG_DIR: dir } as NodeJS.ProcessEnv, () => blob("kc-token", 99));
    expect(auth).toEqual({ token: "file-token", expiresAt: 42 });
  });

  it("resolveClaudeCodeToken throws actionable errors", () => {
    expect(() =>
      resolveClaudeCodeToken({ CLAUDE_CONFIG_DIR: "/nope" } as NodeJS.ProcessEnv, 1000, noKeychain),
    ).toThrow(/No Claude Code login/);
  });

  it("resolveClaudeCodeToken errors on an expired token", async () => {
    await writeFile(join(dir, ".credentials.json"), blob("x", 1));
    expect(() =>
      resolveClaudeCodeToken({ CLAUDE_CONFIG_DIR: dir } as NodeJS.ProcessEnv, 1000, noKeychain),
    ).toThrow(/expired/);
  });

  it("resolveClaudeCodeToken returns a valid token (file or keychain)", async () => {
    await writeFile(join(dir, ".credentials.json"), blob("good-token", 9_999_999_999_999));
    expect(resolveClaudeCodeToken({ CLAUDE_CONFIG_DIR: dir } as NodeJS.ProcessEnv, 1000, noKeychain)).toBe(
      "good-token",
    );
    // and from the keychain when the file is absent
    expect(
      resolveClaudeCodeToken({ CLAUDE_CONFIG_DIR: "/nope" } as NodeJS.ProcessEnv, 1000, () =>
        blob("kc-good", 9_999_999_999_999),
      ),
    ).toBe("kc-good");
  });
});
