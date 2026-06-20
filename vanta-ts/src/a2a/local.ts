import type { A2AMessage, A2AHandler, A2ATransport } from "./types.js";

// Module-level counter for deterministic ids — A2A is a basic in-process stub
// (Phase 6), so ids are reproducible (no time/random) for testable transcripts.
let messageCounter = 0;

/**
 * In-process Agent-to-Agent message bus. Routes a message to the handler
 * registered under `message.to` and awaits its reply. Networked transport
 * (HTTP/Google A2A) is future work; this is the local interface it slots behind.
 */
export class A2ABus implements A2ATransport {
  readonly #handlers = new Map<string, A2AHandler>();

  register(agentId: string, handler: A2AHandler): void {
    this.#handlers.set(agentId, handler);
  }

  unregister(agentId: string): void {
    this.#handlers.delete(agentId);
  }

  async send(message: A2AMessage): Promise<A2AMessage | null> {
    const handler = this.#handlers.get(message.to);
    if (!handler) {
      throw new Error(
        `no agent registered for "${message.to}"; registered: ${
          this.list().join(", ") || "(none)"
        }`,
      );
    }
    return handler(message);
  }

  list(): string[] {
    return [...this.#handlers.keys()];
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
