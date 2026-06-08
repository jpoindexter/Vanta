// SHIP-MODE: a focused posture that narrows attention to one active shipping
// item and refuses unrelated expansion unless explicitly requested.
// Implemented as a prompt injection that biases every turn toward verified closure.

export type ShipModeState = {
  active: boolean;
  target?: string; // the card/item being shipped
};

const SHIP_MARKER = "[SHIP-MODE]";

export function buildShipPrompt(target: string): string {
  return `${SHIP_MARKER} Ship mode active — shipping: ${target}.
Each turn: do ONE thing that moves this item toward done. No new ideas, no scope expansion, no "while we're at it." If an unrelated request arrives, park it and say so. End every turn with: what changed · what was verified · what remains to ship. When the item ships, announce it and exit ship mode.`;
}

export function isInShipMode(systemPrompt: string): boolean {
  return systemPrompt.includes(SHIP_MARKER);
}

export function extractShipTarget(systemPrompt: string): string | null {
  const match = systemPrompt.match(/\[SHIP-MODE\] Ship mode active — shipping: (.+?)\.?\n/);
  return match?.[1] ?? null;
}

export function buildShipNote(target: string): string {
  return `  ⚓ ship mode — focused on: ${target}\n  Each turn ends with: changed · verified · remains`;
}
