import type { Message } from "../types.js";

// Volatile skills (#36656): a skill marked `volatile: true` is loaded by `recall`
// for the CURRENT turn only — its body is dropped from history afterward so a big
// skill doesn't sit in context for the next 200 turns. recall prefixes a volatile
// body with VOLATILE_PREFIX<name>⟧; pruneVolatileSkills (run post-turn) replaces
// the body with a short stub, keeping the record that it was consulted.

export const VOLATILE_PREFIX = "⟦volatile-skill:";
const CLOSE = "⟧";

/** Wrap a recalled volatile skill body so it can be pruned after the turn. */
export function markVolatile(name: string, body: string): string {
  return `${VOLATILE_PREFIX}${name}${CLOSE}\n${body}`;
}

/** Replace volatile recall bodies in-place with a stub. Idempotent. */
export function pruneVolatileSkills(messages: Message[]): void {
  for (const m of messages) {
    if (m.role === "tool" && m.name === "recall" && m.content.startsWith(VOLATILE_PREFIX)) {
      const name = m.content.slice(VOLATILE_PREFIX.length).split(CLOSE)[0] ?? "skill";
      m.content = `${VOLATILE_PREFIX}${name}${CLOSE} (body dropped after use to save context)`;
    }
  }
}
