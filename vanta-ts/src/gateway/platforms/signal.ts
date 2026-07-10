import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";
import { parseSignalRateLimit, SignalRateLimiter } from "./signal-rate-limit.js";

// Signal has no hard API cap, but very long single messages are rejected/clipped
// by clients; 2000 chars is a safe per-message budget.
const SIGNAL_LIMIT = 2000;

// MSG-SIGNAL: Signal adapter via signal-cli in daemon HTTP mode.
// signal-cli exposes a local JSON-RPC 2.0 server for SEND and SSE for RECEIVE.
// Prerequisites: signal-cli installed + registered + running as HTTP daemon.
// Pure parse functions are offline-testable.

const DEFAULT_SIGNAL_URL = "http://127.0.0.1:8080";
const signalSendLimiter = new SignalRateLimiter();

const SignalMessageSchema = z.object({
  envelope: z.object({
    source: z.string(),
    // The message timestamp doubles as Signal's stable message id (quotes
    // reference it), so it keys dedup + reply-context lookup.
    timestamp: z.number().optional(),
    dataMessage: z.object({
      message: z.string().nullable().optional(),
      // Present only in a group; groupId (base64) is the group's address and
      // the correct reply target — so a group reply goes to the group, not the
      // individual sender.
      groupInfo: z.object({ groupId: z.string() }).optional(),
      // A reply quotes the original message's timestamp (its id).
      quote: z.object({ id: z.number() }).optional(),
    }).optional(),
  }),
});

// signal-cli's `send` reply surfaces the assigned message timestamp (the sent
// message's id) under result.timestamp.
const SignalSendResponse = z.object({
  result: z.object({ timestamp: z.number() }).optional(),
});

/** Parse a signal-cli SSE event payload into an InboundMessage. Pure. */
export function parseSignalEvent(raw: string): InboundMessage | null {
  try {
    const parsed = SignalMessageSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const env = parsed.data.envelope;
    const data = env.dataMessage;
    const msg = data?.message;
    if (!msg?.trim()) return null;
    const groupId = data?.groupInfo?.groupId;
    const quoteId = data?.quote?.id;
    return {
      // In a group the groupId is the reply target; in a 1:1 it's the source.
      chatId: groupId ?? env.source,
      text: msg,
      id: env.timestamp !== undefined ? String(env.timestamp) : undefined,
      isGroup: groupId !== undefined ? true : undefined,
      replyToId: quoteId !== undefined ? String(quoteId) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Pure: extract the sent message's timestamp (stringified id) from a signal-cli
 * send response, or undefined when the response is malformed. Used to key the
 * outbound message for reply-context lookup.
 */
export function parseSignalSentId(payload: unknown): string | undefined {
  const parsed = SignalSendResponse.safeParse(payload);
  if (!parsed.success || !parsed.data.result) return undefined;
  return String(parsed.data.result.timestamp);
}

/** Build the JSON-RPC payload for signal-cli send. Pure. */
export function buildSendPayload(
  number: string,
  recipient: string,
  message: string,
): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    method: "send",
    id: Date.now(),
    params: { account: number, recipient: [recipient], message },
  });
}

export class SignalAdapter implements PlatformAdapter {
  readonly id = "signal";
  private readonly baseUrl: string;
  private readonly number: string;
  private pollOffset = 0;

  constructor(opts: { baseUrl?: string; number: string }) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_SIGNAL_URL;
    this.number = opts.number;
  }

  async connect(): Promise<void> {
    // Verify the signal-cli daemon is reachable.
    const res = await fetch(`${this.baseUrl}/api/v1/about`).catch(() => null);
    if (!res?.ok) {
      throw new Error(`Signal: daemon not reachable at ${this.baseUrl}. Start with: signal-cli -a ${this.number} daemon --http`);
    }
  }

  async disconnect(): Promise<void> { /* stateless */ }

  async poll(): Promise<InboundMessage[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/receive?account=${encodeURIComponent(this.number)}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return [];
      const events = (await res.json()) as unknown[];
      const messages: InboundMessage[] = [];
      for (const event of Array.isArray(events) ? events : []) {
        const msg = parseSignalEvent(JSON.stringify(event));
        if (msg) messages.push(msg);
      }
      return messages;
    } catch {
      return [];
    }
  }

  async send(msg: OutboundMessage): Promise<void> {
    // Signal's send takes plain text — strip markdown to readable prose (code
    // spans survive) BEFORE splitting so `**`/``` never leak. (Style ranges are
    // a future enrichment; plain is correct and never mangles code.)
    const formatted = formatForDialect(msg.text, "plain");
    for (const part of splitForLimit(formatted, SIGNAL_LIMIT, "chars")) {
      await signalSendLimiter.acquire();
      const payload = buildSendPayload(this.number, msg.chatId, part);
      const res = await fetch(`${this.baseUrl}/api/v1/jsonrpc`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
      });
      if (!res.ok) {
        const limited = parseSignalRateLimit({ status: res.status, body: await res.text().catch(() => "") });
        signalSendLimiter.feedback(limited);
        throw new Error(limited.limited ? `Signal send rate-limited: ${limited.reason}` : `Signal send failed: HTTP ${res.status}`);
      }
      // Record the FIRST part's assigned timestamp as the reply-context key; a
      // split message's head is the stable reply target. Best-effort: a body we
      // can't parse just leaves id undefined.
      const body = await res.json().catch(() => undefined);
      const limited = parseSignalRateLimit(body);
      if (limited.limited) {
        signalSendLimiter.feedback(limited);
        throw new Error(`Signal send rate-limited: ${limited.reason}`);
      }
      if (msg.id === undefined) {
        msg.id = parseSignalSentId(body);
      }
    }
  }
}
