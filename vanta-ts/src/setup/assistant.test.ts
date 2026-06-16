import { describe, expect, it, vi } from "vitest";

import {
  probeGoogleAuth,
  probeMcp,
  probeMessaging,
  probeProvider,
  runGoogleStep,
  type ProbeResult,
} from "./assistant.js";
import type { LLMProvider } from "../providers/interface.js";

function provider(complete: LLMProvider["complete"]): LLMProvider {
  return { complete, modelId: () => "fake-model", contextWindow: () => 1000 };
}

describe("setup assistant probes", () => {
  it("provider probe calls the resolved provider with a real completion", async () => {
    const complete = vi.fn(async () => ({ text: "OK", toolCalls: [], finishReason: "stop" }));
    const result = await probeProvider({}, { resolve: () => provider(complete) });
    expect(result).toEqual({ ok: true, detail: "fake-model responded" });
    expect(complete).toHaveBeenCalledWith(
      [{ role: "user", content: expect.stringContaining("setup check") }],
      [],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const calls = complete.mock.calls as unknown as Array<[unknown, unknown, Record<string, unknown>]>;
    expect(calls[0]?.[2]).not.toHaveProperty("maxTokens");
  });

  it("provider probe returns an error value instead of throwing", async () => {
    const result = await probeProvider({}, { resolve: () => { throw new Error("bad key"); } });
    expect(result).toEqual({ ok: false, detail: "bad key" });
  });

  it("provider probe redacts long secret values from error details", async () => {
    const env = { OPENAI_API_KEY: "sk-secret-value" };
    const result = await probeProvider(env, {
      resolve: () => { throw new Error("rejected sk-secret-value"); },
    });
    expect(result.detail).toBe("rejected [redacted]");
  });

  it("google probe reflects the token checker", async () => {
    expect(await probeGoogleAuth({}, async () => true)).toEqual({ ok: true, detail: "authorized" });
    expect(await probeGoogleAuth({}, async () => false)).toEqual({ ok: false, detail: "not authorized" });
  });

  it("google step runs OAuth then re-checks authorization", async () => {
    const seen: string[] = [];
    const result = await runGoogleStep({
      env: { VANTA_GOOGLE_CLIENT_ID: "id", VANTA_GOOGLE_CLIENT_SECRET: "secret" },
      select: async () => 0,
      runAuth: async () => { seen.push("auth"); },
      hasAuth: async () => seen.includes("auth"),
      log: () => {},
    });
    expect(result).toEqual({ ok: true, detail: "authorized" });
  });

  it("mcp probe mounts configured servers and reports discovered tools", async () => {
    const result = await probeMcp({
      env: {},
      cwd: "/repo",
      readConfig: async () => ({ servers: { fs: { command: "mcp-fs" } } }),
      mount: async () => ({ servers: ["fs"], toolCount: 3, dispose: () => {} }),
    });
    expect(result).toEqual({ ok: true, detail: "mounted 1 server(s), 3 tool(s)" });
  });

  it("mcp probe is optional when no config exists", async () => {
    const result = await probeMcp({
      env: {},
      cwd: "/repo",
      readConfig: async () => ({ servers: {} }),
      mount: async () => { throw new Error("should not mount"); },
    });
    expect(result).toEqual({ ok: false, detail: "no MCP servers configured" });
  });

  it("messaging probe validates configured Telegram with the Bot API", async () => {
    const fetch = vi.fn(async () => ({ json: async () => ({ ok: true, result: { username: "vanta_bot" } }) }));
    const result = await probeMessaging({ VANTA_TELEGRAM_TOKEN: "123:abc" }, fetch as never);
    expect(result).toEqual({ ok: true, detail: "Telegram bot vanta_bot responded" });
    expect(result.detail).not.toContain("123:abc");
  });

  it("messaging probe reports optional when no implemented platform is configured", async () => {
    const fetch = vi.fn();
    const result: ProbeResult = await probeMessaging({}, fetch as never);
    expect(result).toEqual({ ok: false, detail: "no messaging platform configured" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
