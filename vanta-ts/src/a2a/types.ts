// Local in-process subset of the Google A2A (Agent-to-Agent) protocol.
//
// v0 has no network transport: agents exchange messages directly within
// the same process via the in-memory bus. The shapes mirror the A2A wire
// types (message id, from/to, role, typed parts) so a real transport can
// be slotted in later without changing the agent-facing contract.

/** A single piece of message content. Only text is supported in v0. */
export type A2APart = { kind: "text"; text: string };

/** An A2A message exchanged between two agents. */
export type A2AMessage = {
  id: string;
  from: string;
  to: string;
  role: "user" | "agent";
  parts: A2APart[];
};

/**
 * An agent's inbound message handler. Returns a reply message, or `null`
 * when the agent has nothing to send back.
 */
export type A2AHandler = (
  message: A2AMessage,
) => A2AMessage | null | Promise<A2AMessage | null>;
