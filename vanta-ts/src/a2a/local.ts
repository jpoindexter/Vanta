import type { A2AMessage, A2AHandler, A2ATransport } from "./types.js";

// PORT-A2A-TRANSPORT — the delivery seam below the bus. `A2ABus.send()` no longer
// fuses the handler lookup + dispatch: it delegates to a `DeliveryTransport`
// (mirrors mcp/client.ts's Transport — an interface adapters implement). The
// in-process `LocalDelivery` IS the handler map; a networked transport (HTTP /
// Google A2A) implements the same `deliver()` and is injected as the bus's
// remote fallback, so a real transport drops in WITHOUT editing send().

// Module-level counter for deterministic ids — A2A stays reproducible (no
// time/random) for testable transcripts.
let messageCounter = 0;

/** The low-level delivery seam: get a message to its target, return the reply. */
export interface DeliveryTransport {
  deliver(message: A2AMessage): Promise<A2AMessage | null>;
  /** Agent ids this transport can reach right now (for routing + diagnostics). */
  reaches(): string[];
}

/** In-process delivery over a handler map — the default (local) transport. */
export class LocalDelivery implements DeliveryTransport {
  readonly #handlers = new Map<string, A2AHandler>();

  register(agentId: string, handler: A2AHandler): void {
    this.#handlers.set(agentId, handler);
  }

  unregister(agentId: string): void {
    this.#handlers.delete(agentId);
  }

  has(agentId: string): boolean {
    return this.#handlers.has(agentId);
  }

  reaches(): string[] {
    return [...this.#handlers.keys()];
  }

  async deliver(message: A2AMessage): Promise<A2AMessage | null> {
    const handler = this.#handlers.get(message.to);
    if (!handler) {
      throw new Error(`no agent registered for "${message.to}"; registered: ${this.reaches().join(", ") || "(none)"}`);
    }
    return handler(message);
  }
}

/**
 * In-process Agent-to-Agent message bus. Routes LOCAL-registered agents through
 * its LocalDelivery; when a target isn't local and a `remote` transport was
 * injected, it delegates there instead — so adding a networked transport is a
 * constructor argument, not an edit to `send()`.
 */
export class A2ABus implements A2ATransport {
  readonly #local = new LocalDelivery();
  readonly #remote?: DeliveryTransport;

  constructor(remote?: DeliveryTransport) {
    this.#remote = remote;
  }

  register(agentId: string, handler: A2AHandler): void {
    this.#local.register(agentId, handler);
  }

  unregister(agentId: string): void {
    this.#local.unregister(agentId);
  }

  async send(message: A2AMessage): Promise<A2AMessage | null> {
    // Local-registered agent → local delivery; otherwise a networked transport
    // (when injected) handles it. No remote + not local → the local delivery's
    // helpful "no agent registered" error.
    if (!this.#local.has(message.to) && this.#remote) return this.#remote.deliver(message);
    return this.#local.deliver(message);
  }

  /** Every reachable agent id: local, plus a remote transport's reach. */
  list(): string[] {
    return [...new Set([...this.#local.reaches(), ...(this.#remote?.reaches() ?? [])])];
  }
}

/**
 * Build an A2AMessage. `id` defaults to a deterministic counter-based id
 * ("a2a-<n>"), never time/random, so transcripts are reproducible.
 */
export function makeMessage(opts: {
  from: string;
  to: string;
  text: string;
  role?: "user" | "agent";
  id?: string;
}): A2AMessage {
  return {
    id: opts.id ?? `a2a-${++messageCounter}`,
    from: opts.from,
    to: opts.to,
    role: opts.role ?? "user",
    parts: [{ kind: "text", text: opts.text }],
  };
}
