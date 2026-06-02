import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isTokenExpired, readClaudeCodeAuth, resolveClaudeCodeToken } from "./claude-code-auth.js";

describe("isTokenExpired", () => {
  const now = 1_000_000;
  it("is true for a past expiry", () => expect(isTokenExpired(now - 1, now)).toBe(true));
  it("is false for a future expiry", () => expect(isTokenExpired(now + 1, now)).toBe(false));
  it("is false when expiry is unknown", () => expect(isTokenExpired(undefined, now)).toBe(false));
});

describe("readClaudeCodeAuth", () => {
  it("prefers an explicit env token", () => {
    expect(readClaudeCodeAuth({ CLAUDE_CODE_OAUTH_TOKEN: "tok-1" } as NodeJS.ProcessEnv)).toEqual({
      token: "tok-1",
    });
    expect(readClaudeCodeAuth({ ANTHROPIC_AUTH_TOKEN: "tok-2" } as NodeJS.ProcessEnv)).toEqual({
      token: "tok-2",
    });
  });

  it("returns null when nothing is configured", () => {
    expect(readClaudeCodeAuth({ CLAUDE_CONFIG_DIR: "/nope-xyz" } as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("readClaudeCodeAuth from the credentials file", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "argo-claude-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads accessToken + expiresAt from ~/.claude/.credentials.json", async () => {
    await writeFile(
      join(dir, ".credentials.json"),
      JSON.stringify({ claudeAiOauth: { accessToken: "sk-ant-oat01-x", expiresAt: 42 } }),
    );
    const auth = readClaudeCodeAuth({ CLAUDE_CONFIG_DIR: dir } as NodeJS.ProcessEnv);
    expect(auth).toEqual({ token: "sk-ant-oat01-x", expiresAt: 42 });
  });

  it("resolveClaudeCodeToken throws actionable errors", () => {
    expect(() => resolveClaudeCodeToken({ CLAUDE_CONFIG_DIR: "/nope" } as NodeJS.ProcessEnv)).toThrow(
      /No Claude Code login/,
    );
  });

  it("resolveClaudeCodeToken errors on an expired token", async () => {
    await writeFile(
      join(dir, ".credentials.json"),
      JSON.stringify({ claudeAiOauth: { accessToken: "x", expiresAt: 1 } }),
    );
    expect(() =>
      resolveClaudeCodeToken({ CLAUDE_CONFIG_DIR: dir } as NodeJS.ProcessEnv, 1000),
    ).toThrow(/expired/);
  });

  it("resolveClaudeCodeToken returns a valid token", async () => {
    await writeFile(
      join(dir, ".credentials.json"),
      JSON.stringify({ claudeAiOauth: { accessToken: "good-token", expiresAt: 9_999_999_999_999 } }),
    );
    expect(resolveClaudeCodeToken({ CLAUDE_CONFIG_DIR: dir } as NodeJS.ProcessEnv, 1000)).toBe(
      "good-token",
    );
  });
});
