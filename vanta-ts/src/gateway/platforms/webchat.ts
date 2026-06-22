import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { stripControl } from "./line.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// WebChat adapter — connects Vanta to a LOCAL browser chat widget (no external account,
// no third-party API). It implements the same PlatformAdapter contract as the LINE/Telegram
// adapters so the gateway treats it like any other channel. There is NO real network here:
// the browser talks to a small HTTP endpoint that the GATEWAY wires later (out of scope for
// this file); that endpoint feeds the in-memory `WebChatBuffer` this adapter polls and the
// browser then fetches replies from. The buffer IS the injected boundary, exactly like LINE's
// `httpTransport` — but it's a pure in-memory queue instead of a fetch wrapper, so the whole
// adapter is unit-testable with no server and no sockets.
//
// Inbound shape (what the browser POSTs, then the gateway pushes into the buffer):
//   {chatId, text, from?}. parse → InboundMessage[]. chatId IS the conversation/routing key
//   (a browser-session id the widget invents); a reply is enqueued back keyed by that same
//   chatId for the browser to fetch. `from` (optional display name) defaults to the chatId.
//   Inbound text is control-stripped (untrusted remote input). A row missing chatId or text,
//   or any non-object, is dropped (garbage → []). Accepts a single object OR an array.
// Outbound: buildWebChatReply(chatId, text) → {chatId, text}; the adapter enqueues it onto the
//   buffer's outbound queue keyed by chatId, where the browser drains it.
// Enable: VANTA_WEBCHAT_ENABLE === "1". Optional VANTA_WEBCHAT_ALLOWLIST = comma list of chat
//   ids (browser-session ids) to accept (empty → allow all). No secret — this is a self-hosted
//   local chat, so there is no token to read at the wire (the LINE adapter's secret boundary).

// Browser-side budget: WebChat renders the reply as text in the page, so there is no hard
// platform cap. We still split long replies into separate chat bubbles for readable rendering.
const WEBCHAT_TEXT_LIMIT = 4000;

// The marker env value that turns the WebChat channel on. Presence alone is not enough — an
// empty/other value leaves it off, so a stray export doesn't silently enable a chat surface.
const ENABLE_VALUE = "1";

// One inbound row as the browser POSTs it. Tolerant: only the routable fields are required;
// unknown extras (a client timestamp, a nonce, …) are ignored by zod's default object parse.
const WebChatInbound = z.object({
  chatId: z.string(),
  text: z.string(),
  from: z.string().optional(),
});

/** Coerce an inbound payload to an array of rows: a single object OR a bare array. Pure. */
function rowsOf(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") return [json];
  return [];
}

/**
 * Parse a WebChat inbound payload into inbound messages. Accepts a single `{chatId, text, from?}`
 * object OR a bare array of them. A row that fails the shape (missing chatId/text, wrong type) is
 * SKIPPED; a non-object/non-array payload yields []. `chatId` is the conversation/routing key the
 * reply is enqueued under; `from` defaults to the chatId when the browser omits a display name.
 * Inbound text is control-stripped (untrusted remote input). Pure.
 */
export function parseWebChatInbound(json: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const raw of rowsOf(json)) {
    const parsed = WebChatInbound.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    messages.push({
      chatId: row.chatId,
      from: row.from ?? row.chatId,
      text: stripControl(row.text),
    });
  }
  return messages;
}

/**
 * Build the outbound reply the browser fetches: {chatId, text}. `chatId` is the conversation key
 * (the same browser-session id the inbound carried). The text is control-stripped and capped at
 * the per-bubble limit (the adapter splits a long reply into separate bubbles first; this is the
 * per-message backstop). Pure.
 */
export function buildWebChatReply(chatId: string, text: string): { chatId: string; text: string } {
  return { chatId, text: stripControl(text).slice(0, WEBCHAT_TEXT_LIMIT) };
}

/**
 * Parse the VANTA_WEBCHAT_ALLOWLIST chat-id allowlist (comma list). Empty/absent → an empty set,
 * which the adapter treats as "allow all". Pure.
 */
export function parseWebChatAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.VANTA_WEBCHAT_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * WebChat is enabled only when VANTA_WEBCHAT_ENABLE === "1". Absent/empty/other = disabled, so a
 * stray non-"1" export never silently opens the chat surface. Pure.
 */
export function webchatEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.VANTA_WEBCHAT_ENABLE?.trim() === ENABLE_VALUE;
}

/**
 * The in-memory WebChat transport — the documented boundary (the LINE adapter's `httpTransport`
 * equivalent, but a pure queue, not a fetch wrapper). The gateway's HTTP endpoint `pushInbound`s
 * each browser message; the adapter's `poll` `drainInbound`s them. The adapter's `send`
 * `pushOutbound`s a reply keyed by chatId; the browser's fetch endpoint `drainOutbound(chatId)`s
 * it. Drains are destructive (each message is delivered once). No network, no secret.
 */
export type WebChatBuffer = {
  pushInbound: (msg: InboundMessage) => void;
  drainInbound: () => InboundMessage[];
  pushOutbound: (chatId: string, text: string) => void;
  drainOutbound: (chatId: string) => string[];
};

/**
 * Create an in-memory WebChat buffer. Inbound is one shared FIFO (every conversation's messages
 * drain together for the gateway tick); outbound is keyed per chatId so each browser session
 * fetches only its own replies. Drains return + clear. Closure state, no shared globals — a fresh
 * call yields an isolated buffer (one per gateway, or per test).
 */
export function createWebChatBuffer(): WebChatBuffer {
  const inbound: InboundMessage[] = [];
  const outbound = new Map<string, string[]>();
  return {
    pushInbound: (msg) => {
      inbound.push(msg);
    },
    drainInbound: () => inbound.splice(0, inbound.length),
    pushOutbound: (chatId, text) => {
      const queue = outbound.get(chatId) ?? [];
      queue.push(text);
      outbound.set(chatId, queue);
    },
    drainOutbound: (chatId) => {
      const queue = outbound.get(chatId) ?? [];
      outbound.delete(chatId);
      return queue;
    },
  };
}

export class WebChatAdapter implements PlatformAdapter {
  readonly id = "webchat";
  private readonly buffer: WebChatBuffer;
  private readonly allow: Set<string>;

  constructor(opts: { buffer: WebChatBuffer; allow?: Set<string> }) {
    this.buffer = opts.buffer;
    this.allow = opts.allow ?? new Set();
  }

  async connect(): Promise<void> {
    /* in-memory queue via the injected buffer — nothing to set up */
  }
  async disconnect(): Promise<void> {
    /* nothing to tear down */
  }

  async poll(): Promise<InboundMessage[]> {
    // Drain is synchronous + in-memory, but guard anyway: errors-as-values, never throw the
    // gateway loop. A buffer that somehow rejects yields no messages this tick.
    let messages: InboundMessage[];
    try {
      messages = this.buffer.drainInbound();
    } catch {
      return [];
    }
    if (this.allow.size === 0) return messages;
    // Allow a message whose conversation (chatId) OR sender (from) is listed.
    return messages.filter(
      (m) => this.allow.has(m.chatId) || (m.from !== undefined && this.allow.has(m.from)),
    );
  }

  async send(msg: OutboundMessage): Promise<void> {
    // The browser renders plain text (no markdown), so degrade the agent's markdown to readable
    // plain text, then split into per-bubble parts and enqueue each keyed by chatId.
    try {
      const formatted = formatForDialect(msg.text, "plain");
      for (const part of splitForLimit(formatted, WEBCHAT_TEXT_LIMIT, "chars")) {
        const reply = buildWebChatReply(msg.chatId, part);
        this.buffer.pushOutbound(reply.chatId, reply.text);
      }
    } catch {
      /* errors-as-values: an enqueue failure must not throw through the gateway loop */
    }
  }
}
