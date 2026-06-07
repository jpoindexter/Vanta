import { describe, it, expect } from "vitest";
import { isRetryableTool, isTransientFailure, shouldRetryTool, resolveToolRetries } from "./tool-retry.js";

describe("isRetryableTool", () => {
  it("allows idempotent reads", () => {
    for (const t of ["read_file", "web_fetch", "web_search", "git_status", "gmail_read"]) {
      expect(isRetryableTool(t)).toBe(true);
    }
  });

  it("refuses writes / shell / spawns (re-run could double a side effect)", () => {
    for (const t of ["write_file", "shell_cmd", "git_commit", "git_push", "run_code", "gmail_send", "delegate", "swarm", "todo"]) {
      expect(isRetryableTool(t)).toBe(false);
    }
  });

  it("defaults unknown tools to non-retryable", () => {
    expect(isRetryableTool("some_new_tool")).toBe(false);
  });
});

describe("isTransientFailure", () => {
  it("matches network / timeout / rate-limit failures", () => {
    expect(isTransientFailure(false, "fetch failed: ETIMEDOUT")).toBe(true);
    expect(isTransientFailure(false, "HTTP 503 Service Unavailable")).toBe(true);
    expect(isTransientFailure(false, "rate limit exceeded")).toBe(true);
    expect(isTransientFailure(false, "socket hang up")).toBe(true);
  });

  it("does not match a deterministic failure (won't fix on retry)", () => {
    expect(isTransientFailure(false, "ENOENT: no such file 'x'")).toBe(false);
    expect(isTransientFailure(false, "invalid argument: path required")).toBe(false);
  });

  it("never flags a success", () => {
    expect(isTransientFailure(true, "ok, fetched 200 timeout-free")).toBe(false);
  });
});

describe("shouldRetryTool", () => {
  it("retries a transient read failure", () => {
    expect(shouldRetryTool("web_fetch", false, "ECONNRESET")).toBe(true);
  });

  it("does not retry a transient WRITE failure (not idempotent)", () => {
    expect(shouldRetryTool("write_file", false, "ETIMEDOUT")).toBe(false);
  });

  it("does not retry a non-transient read failure", () => {
    expect(shouldRetryTool("read_file", false, "ENOENT not found")).toBe(false);
  });
});

describe("resolveToolRetries", () => {
  it("defaults to 1 and clamps to 0..5", () => {
    expect(resolveToolRetries({})).toBe(1);
    expect(resolveToolRetries({ VANTA_TOOL_RETRIES: "3" })).toBe(3);
    expect(resolveToolRetries({ VANTA_TOOL_RETRIES: "99" })).toBe(5);
    expect(resolveToolRetries({ VANTA_TOOL_RETRIES: "0" })).toBe(0);
    expect(resolveToolRetries({ VANTA_TOOL_RETRIES: "junk" })).toBe(1);
  });
});
