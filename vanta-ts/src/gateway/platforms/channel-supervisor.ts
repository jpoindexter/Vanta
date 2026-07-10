import type { InboundMessage, OutboundDeliveryReceipt, OutboundMessage, PlatformAdapter, PlatformWebhookHandler } from "./base.js";

// GATEWAY-CHANNEL-SELFHEAL — wrap a child PlatformAdapter so a dropped channel
// self-heals: a failed poll marks the channel down and schedules an
// exponential-backoff reconnect, checked inside poll() on the gateway's tick
// loop (no timers → clock-injectable, fully testable). One flapping channel
// never blocks the others; poll()/send()/connect() never throw across the seam.

/** Backoff bounds (ms). The Nth failure waits BASE·2^(N-1), capped at MAX. */
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 60_000;

/** Pure: the reconnect delay for the Nth consecutive failure (1-indexed). */
export function backoffMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
}

export type ChannelHealth = {
  id: string;
  status: "up" | "down";
  /** Consecutive poll/reconnect failures since the channel was last up. */
  failures: number;
  /** Last error message that dropped the channel, when down. */
  lastError?: string;
  /** Clock value (ms) of the most recent successful reconnect, if any. */
  lastReconnectAt?: number;
};

/** Pure: the health entries whose status changed vs a prior snapshot. */
export function changedHealth(prev: ChannelHealth[], curr: ChannelHealth[]): ChannelHealth[] {
  const before = new Map(prev.map((h) => [h.id, h.status]));
  return curr.filter((h) => before.get(h.id) !== h.status);
}

/** Pure: a one-line gateway log for a channel health transition. */
export function formatHealthTransition(h: ChannelHealth): string {
  return h.status === "down"
    ? `channel ${h.id} down (${h.lastError ?? "poll failed"}) — reconnecting`
    : `channel ${h.id} recovered`;
}

/**
 * Supervises one adapter: tracks health and, once down, reconnects with backoff
 * on the next poll after the delay elapses. Satisfies PlatformAdapter so a
 * composite can hold it transparently.
 */
export class SupervisedChannel implements PlatformAdapter {
  readonly id: string;
  private status: "up" | "down" = "up";
  private failures = 0;
  private lastError?: string;
  private lastReconnectAt?: number;
  private nextRetryAt = 0;

  constructor(
    private readonly child: PlatformAdapter,
    private readonly now: () => number = () => Date.now(),
    private readonly onChange?: (h: ChannelHealth) => void,
  ) {
    this.id = child.id;
  }

  health(): ChannelHealth {
    return {
      id: this.id,
      status: this.status,
      failures: this.failures,
      lastError: this.lastError,
      lastReconnectAt: this.lastReconnectAt,
    };
  }

  /** Connect once; a failure marks the channel down so poll() retries it. */
  async connect(): Promise<void> {
    try {
      await this.child.connect();
      this.markUp();
    } catch (e) {
      this.markDown(e);
    }
  }

  async disconnect(): Promise<void> {
    await this.child.disconnect().catch(() => {});
  }

  async send(msg: OutboundMessage): Promise<OutboundDeliveryReceipt | undefined> {
    return (await this.child.send(msg).catch(() => undefined)) ?? undefined;
  }

  webhookHandlers(): PlatformWebhookHandler[] {
    return this.child.webhookHandlers?.() ?? [];
  }

  /** Poll, healing first if down and the backoff has elapsed. Never throws. */
  async poll(): Promise<InboundMessage[]> {
    if (this.status === "down") {
      if (this.now() < this.nextRetryAt) return [];
      if (!(await this.tryReconnect())) return [];
    }
    try {
      return await this.child.poll();
    } catch (e) {
      this.markDown(e);
      return [];
    }
  }

  private async tryReconnect(): Promise<boolean> {
    await this.child.disconnect().catch(() => {});
    try {
      await this.child.connect();
      this.markUp();
      return true;
    } catch (e) {
      this.markDown(e);
      return false;
    }
  }

  private markDown(e: unknown): void {
    const wasUp = this.status === "up";
    this.failures += 1;
    this.status = "down";
    this.lastError = e instanceof Error ? e.message : String(e);
    this.nextRetryAt = this.now() + backoffMs(this.failures);
    if (wasUp) this.onChange?.(this.health()); // fire only on the down transition
  }

  private markUp(): void {
    const wasDown = this.status === "down";
    this.status = "up";
    this.failures = 0;
    this.lastError = undefined;
    if (wasDown) {
      this.lastReconnectAt = this.now();
      this.onChange?.(this.health());
    }
  }
}
