import type { ApprovalReply, ReplyStream } from "./channel-relay.js";

// CHANNEL-PERMISSIONS-WIRE — the in-process bridge between the gateway's
// inbound poll loop and pending approval relays. The gateway offers every
// inbound message; the bus CONSUMES it (so it never becomes an agent turn)
// only when its text references a currently-pending request id — a normal
// message, or a reply to an already-resolved request, passes through
// untouched. Subscribers (one per in-flight relay) receive consumed replies
// as an abortable async stream.

export type ConsumableMessage = { chatId: string; text: string };

export type ReplyBus = {
  /** Mark a request id as pending (relay start). */
  register(requestId: string): void;
  /** Clear a request id (relay settled — its replies stop being consumed). */
  unregister(requestId: string): void;
  /** Offer an inbound message; true = consumed by a pending approval. */
  tryConsume(msg: ConsumableMessage): boolean;
  /** The relay-side reply stream (aborts cleanly with the race). */
  stream: ReplyStream;
  /** Park a non-approval message polled DURING a relay wait (see pump note). */
  stashBypassed(msg: unknown): void;
  /** Hand parked messages back to the gateway loop's next poll pass. */
  drainBypassed(): unknown[];
};

type Waiter = (reply: ApprovalReply | null) => void;

export function createReplyBus(): ReplyBus {
  const pending = new Set<string>();
  const queues = new Set<{ buf: ApprovalReply[]; waiters: Waiter[] }>();
  // The gateway loop is BLOCKED while a turn awaits an approval, so the relay
  // pumps the platform poll itself; anything it polls that is NOT an approval
  // reply parks here and the main loop drains it on its next pass — no message
  // is lost to the pump.
  let bypassed: unknown[] = [];

  const push = (reply: ApprovalReply): void => {
    for (const q of queues) {
      const waiter = q.waiters.shift();
      if (waiter) waiter(reply);
      else q.buf.push(reply);
    }
  };

  return {
    register: (id) => void pending.add(id.toLowerCase()),
    unregister: (id) => void pending.delete(id.toLowerCase()),
    stashBypassed: (msg) => void bypassed.push(msg),
    drainBypassed: () => bypassed.splice(0),

    tryConsume(msg) {
      const tokens = (msg.text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      if (!tokens.some((t) => pending.has(t))) return false;
      push({ chatId: msg.chatId, text: msg.text });
      return true;
    },

    stream(signal: AbortSignal): AsyncIterable<ApprovalReply> {
      const q = { buf: [] as ApprovalReply[], waiters: [] as Waiter[] };
      queues.add(q);
      const done = (): void => {
        queues.delete(q);
        for (const w of q.waiters.splice(0)) w(null);
      };
      signal.addEventListener("abort", done, { once: true });
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<ApprovalReply>> {
              if (signal.aborted) return { done: true, value: undefined };
              const buffered = q.buf.shift();
              if (buffered) return { done: false, value: buffered };
              const reply = await new Promise<ApprovalReply | null>((res) => q.waiters.push(res));
              return reply ? { done: false, value: reply } : { done: true, value: undefined };
            },
          };
        },
      };
    },
  };
}
