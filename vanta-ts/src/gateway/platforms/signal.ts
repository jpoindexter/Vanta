import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";

// MSG-SIGNAL: Signal adapter via signal-cli in daemon HTTP mode.
// signal-cli exposes a local JSON-RPC 2.0 server for SEND and SSE for RECEIVE.
// Prerequisites: signal-cli installed + registered + running as HTTP daemon.
// Pure parse functions are offline-testable.

const DEFAULT_SIGNAL_URL = "http://127.0.0.1:8080";

const SignalMessageSchema = z.object({
  envelope: z.object({
    source: z.string(),
    dataMessage: z.object({
      message: z.string().nullable().optional(),
    }).optional(),
  }),
});

/** Parse a signal-cli SSE event payload into an InboundMessage. Pure. */
export function parseSignalEvent(raw: string): InboundMessage | null {
  try {
    const parsed = SignalMessageSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const msg = parsed.data.envelope.dataMessage?.message;
    if (!msg?.trim()) return null;
    return { chatId: parsed.data.envelope.source, text: msg };
  } catch {
    return null;
  }
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
    const payload = buildSendPayload(this.number, msg.chatId, msg.text);
    const res = await fetch(`${this.baseUrl}/api/v1/jsonrpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    if (!res.ok) throw new Error(`Signal send failed: HTTP ${res.status}`);
  }
}
