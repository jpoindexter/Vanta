import { z } from "zod";

const DEFAULT_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

const JsonRpcError = z.object({
  error: z.object({
    code: z.number().optional(),
    message: z.string().optional(),
    data: z.unknown().optional(),
  }).optional(),
});

export type SignalRateLimit = {
  limited: boolean;
  retryAfterMs: number;
  reason: string;
};

function clampRetry(ms: number): number {
  return Math.max(DEFAULT_RETRY_MS, Math.min(MAX_RETRY_MS, ms));
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function retryFromText(text: string): number {
  const seconds = text.match(/(?:retry|after|later)[^0-9]{0,20}([0-9]{1,4})\s*(?:s|sec|seconds)?/i)?.[1];
  if (seconds) return clampRetry(Number(seconds) * 1000);
  return DEFAULT_RETRY_MS;
}

export function parseSignalRateLimit(value: unknown): SignalRateLimit {
  const text = textOf(value);
  const parsed = JsonRpcError.safeParse(value);
  const errorText = [
    parsed.success ? parsed.data.error?.message : undefined,
    parsed.success ? textOf(parsed.data.error?.data) : undefined,
    text,
  ].filter(Boolean).join(" ");

  const limited =
    /\b429\b/.test(errorText) ||
    /RateLimitException|RetryLaterException/i.test(errorText) ||
    (parsed.success && parsed.data.error?.code === 429);

  return limited
    ? { limited: true, retryAfterMs: retryFromText(errorText), reason: errorText }
    : { limited: false, retryAfterMs: 0, reason: "" };
}

export type SignalRateLimiterOptions = {
  capacity?: number;
  refillMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export class SignalRateLimiter {
  private readonly capacity: number;
  private readonly refillMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private tokens: number;
  private updatedMs: number;
  private blockedUntilMs = 0;

  constructor(opts: SignalRateLimiterOptions = {}) {
    this.capacity = opts.capacity ?? 3;
    this.refillMs = opts.refillMs ?? 1_000;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.tokens = this.capacity;
    this.updatedMs = this.now();
  }

  private refill(): void {
    const now = this.now();
    const elapsed = Math.max(0, now - this.updatedMs);
    const gained = Math.floor(elapsed / this.refillMs);
    if (gained > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + gained);
      this.updatedMs += gained * this.refillMs;
    }
  }

  async acquire(): Promise<void> {
    this.refill();
    const now = this.now();
    const waitMs = this.blockedUntilMs > now
      ? this.blockedUntilMs - now
      : this.tokens > 0
        ? 0
        : Math.max(1, this.refillMs - (now - this.updatedMs));
    if (waitMs > 0) {
      await this.sleep(waitMs);
      this.refill();
    }
    if (this.tokens > 0) this.tokens -= 1;
  }

  feedback(limit: SignalRateLimit): void {
    if (!limit.limited) return;
    this.tokens = 0;
    this.blockedUntilMs = Math.max(this.blockedUntilMs, this.now() + limit.retryAfterMs);
  }
}
