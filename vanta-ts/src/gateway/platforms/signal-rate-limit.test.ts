import { describe, expect, it } from "vitest";
import { parseSignalRateLimit, SignalRateLimiter } from "./signal-rate-limit.js";

describe("parseSignalRateLimit", () => {
  it("detects bracketed 429 text", () => {
    const parsed = parseSignalRateLimit("[429] too many requests");
    expect(parsed.limited).toBe(true);
    expect(parsed.retryAfterMs).toBe(1000);
  });

  it("detects RateLimitException and RetryLaterException JSON-RPC errors", () => {
    expect(parseSignalRateLimit({ error: { message: "RateLimitException: slow down" } }).limited).toBe(true);
    expect(parseSignalRateLimit({ error: { message: "RetryLaterException retry after 4 seconds" } }).retryAfterMs).toBe(4000);
  });

  it("detects numeric 429 JSON-RPC codes", () => {
    expect(parseSignalRateLimit({ error: { code: 429, message: "retry later" } }).limited).toBe(true);
  });

  it("ignores non-rate-limit failures", () => {
    expect(parseSignalRateLimit({ error: { code: -1, message: "recipient unknown" } }).limited).toBe(false);
  });
});

describe("SignalRateLimiter", () => {
  it("allows the initial burst without sleeping", async () => {
    const slept: number[] = [];
    const limiter = new SignalRateLimiter({ capacity: 2, refillMs: 1000, sleep: async (ms) => { slept.push(ms); } });
    await limiter.acquire();
    await limiter.acquire();
    expect(slept).toEqual([]);
  });

  it("waits after capacity is exhausted", async () => {
    let now = 0;
    const slept: number[] = [];
    const limiter = new SignalRateLimiter({
      capacity: 1,
      refillMs: 1000,
      now: () => now,
      sleep: async (ms) => { slept.push(ms); now += ms; },
    });
    await limiter.acquire();
    await limiter.acquire();
    expect(slept).toEqual([1000]);
  });

  it("backs off when 429 feedback arrives", async () => {
    let now = 0;
    const slept: number[] = [];
    const limiter = new SignalRateLimiter({
      capacity: 1,
      refillMs: 1000,
      now: () => now,
      sleep: async (ms) => { slept.push(ms); now += ms; },
    });
    limiter.feedback({ limited: true, retryAfterMs: 5000, reason: "RetryLaterException" });
    await limiter.acquire();
    expect(slept).toEqual([5000]);
  });
});
