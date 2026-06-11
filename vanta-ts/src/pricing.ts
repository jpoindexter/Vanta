// COST-VISIBLE — rough $/token estimates so local-vs-frontier routing is legible.
// Prices are APPROXIMATE (USD per 1M tokens, public list prices ~2026) and only
// for visibility, not accounting. Unknown models estimate to null (shown as ~?).
// Subscription auth (claude-code/codex) still shows the API-equivalent value
// being consumed. Local models (ollama/lmstudio) are free → $0.

type Price = { in: number; out: number };

// Matched by substring against the model id, first hit wins — order specific→general.
const PRICE_TABLE: ReadonlyArray<readonly [string, Price]> = [
  ["gpt-4o-mini", { in: 0.15, out: 0.6 }],
  ["gpt-4o", { in: 2.5, out: 10 }],
  ["gpt-5", { in: 1.25, out: 10 }],
  ["o4-mini", { in: 1.1, out: 4.4 }],
  ["claude-haiku", { in: 0.8, out: 4 }],
  ["claude-sonnet", { in: 3, out: 15 }],
  ["claude-opus", { in: 15, out: 75 }],
  ["gemini-2.5-pro", { in: 1.25, out: 10 }],
  ["gemini-2.5-flash", { in: 0.1, out: 0.4 }],
  ["gemini", { in: 0.1, out: 0.4 }],
];

const LOCAL_PROVIDERS = new Set(["ollama", "lmstudio"]);

/** A local provider runs on the user's hardware — free + low-power. */
export function isLocalProvider(provider: string | undefined): boolean {
  return LOCAL_PROVIDERS.has((provider ?? "").toLowerCase());
}

/** Rough session cost in USD, or null when the model isn't in the table. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const id = model.toLowerCase();
  const hit = PRICE_TABLE.find(([k]) => id.includes(k));
  if (!hit) return null;
  const [, p] = hit;
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
}

/** Compact USD string. Sub-cent shows more precision so cheap turns aren't all $0.00. */
export function formatUsd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export type FormatTurnCostOpts = {
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
  cost: number | null;
  tokensSaved?: number;
};

/** One-line per-turn footer: tokens + latency + cost + compression savings (or ~? when unpriced). */
export function formatTurnCost(opts: FormatTurnCostOpts): string {
  const { inputTokens, outputTokens, elapsedMs, cost, tokensSaved } = opts;
  const secs = `${(elapsedMs / 1000).toFixed(1)}s`;
  const costStr = cost === null ? "~?" : formatUsd(cost);
  const totalTokens = inputTokens + outputTokens;
  let tokensStr = `${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`;
  if (tokensSaved && tokensSaved > 0) {
    const saved = totalTokens - tokensSaved;
    tokensStr = `${totalTokens.toLocaleString()}→${saved.toLocaleString()} tokens (${tokensSaved.toLocaleString()} saved via compression)`;
  }
  return `· ${tokensStr} · ${secs} · ${costStr}`;
}

/** Running session totals, split local (free) vs frontier (metered), plus compression savings. */
export type SessionCost = { localUsd: number; frontierUsd: number; localTurns: number; frontierTurns: number; totalTokensSaved: number };

/** Fold one turn's cost into the session total by provider class. Pure. */
export function addTurnCost(prev: SessionCost | undefined, provider: string | undefined, cost: number | null, tokensSaved?: number): SessionCost {
  const b = prev ?? { localUsd: 0, frontierUsd: 0, localTurns: 0, frontierTurns: 0, totalTokensSaved: 0 };
  const nextSaved = b.totalTokensSaved + (tokensSaved ?? 0);
  if (isLocalProvider(provider)) return { ...b, localTurns: b.localTurns + 1, totalTokensSaved: nextSaved };
  return { ...b, frontierUsd: b.frontierUsd + (cost ?? 0), frontierTurns: b.frontierTurns + 1, totalTokensSaved: nextSaved };
}

/** The /status + /usage session-cost line, split local vs frontier, with compression savings. */
export function formatSessionCost(c?: SessionCost): string {
  if (!c || (c.localTurns === 0 && c.frontierTurns === 0)) return "session cost: (no turns yet)";
  const t = (n: number) => `${n} turn${n === 1 ? "" : "s"}`;
  let line = `session cost: frontier ${formatUsd(c.frontierUsd)} (${t(c.frontierTurns)}) · local free (${t(c.localTurns)})`;
  if (c.totalTokensSaved > 0) {
    line += ` · ${c.totalTokensSaved.toLocaleString()} tokens saved via compression`;
  }
  return line;
}
