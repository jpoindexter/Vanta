// DECISION-CLASSIFIER — before a HITL gate, classify the pending decision so the
// loop neither over-asks nor over-assumes. Three classes, three routes:
//   mechanical     → one right answer (syntax/lookup/deterministic) → auto-decide SILENTLY.
//   taste          → viable alternatives exist               → auto-decide, SURFACE at the final gate.
//   user-challenge → would override the operator's stated direction → ALWAYS ask.
// Pure: zero I/O, zero LLM. Same heuristic-bank shape as self-monitor/mode-detect.

export type DecisionClass = "mechanical" | "taste" | "user-challenge";

export type DecisionRoute = {
  autoDecide: boolean;
  surfaceAtFinalGate: boolean;
  alwaysAsk: boolean;
};

export type DecisionContext = {
  /** What the agent is about to decide (the action/choice description). */
  action: string;
  /** The operator's stated direction for this work, if any. */
  statedDirection?: string;
};

// A choice "contradicts the operator's direction" when the action proposes a
// reversal verb (skip/drop/replace/ignore/etc.) against something the operator
// explicitly named in their stated direction. Cheap token-overlap, not NLP.
const REVERSAL = /\b(skip|drop|remove|delete|replace|ignore|avoid|abandon|undo|revert|instead of|rather than|don'?t|stop|disable|override|switch (away |off )?from|forget)\b/i;

// Single-correct signals: there's one provably right answer, no judgement call.
const MECHANICAL = /\b(syntax|typo|spelling|format(ting)?|lint|import path|file ?path|lookup|look ?up|signature|type error|compile|rename|exact|deterministic|the only|single correct|one right|spec(ified|ifies)?|required by|constant value|enum value|escape|encoding)\b/i;

// Viable-alternatives signals: judgement, more than one defensible option.
const TASTE = /\b(name|naming|wording|copy|tone|color|layout|spacing|order(ing)?|structure|approach|pattern|style|prefer|either|or |vs\.?|versus|trade-?off|option|alternative|design|phrasing|which|could (also )?be|choose|pick)\b/i;

const STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "in", "on", "for", "and", "or", "but", "with",
  "is", "are", "be", "it", "this", "that", "from", "by", "as", "at", "we", "i",
  "should", "use", "using", "want", "wants", "stated", "direction", "operator",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** True when the action reverses something the operator explicitly stated. Pure. */
export function contradictsDirection(action: string, statedDirection: string | undefined): boolean {
  if (!statedDirection || statedDirection.trim() === "") return false;
  if (!REVERSAL.test(action)) return false;
  const stated = new Set(tokens(statedDirection));
  if (stated.size === 0) return false;
  // The reversal must target a noun the operator actually named.
  return tokens(action).some((t) => stated.has(t));
}

/**
 * Classify the pending decision. Priority is safety-first:
 *   user-challenge (never auto) > taste (auto + surface) > mechanical (auto silent).
 * Defaults to "mechanical" (the cheapest route) only when nothing signals judgement.
 * Pure.
 */
export function classifyDecision(context: DecisionContext): DecisionClass {
  const { action, statedDirection } = context;
  if (contradictsDirection(action, statedDirection)) return "user-challenge";
  const taste = TASTE.test(action);
  const mechanical = MECHANICAL.test(action);
  // Judgement signal wins over a mechanical signal (a mechanical-looking rename
  // that is also a naming choice is still a matter of taste).
  if (taste) return "taste";
  if (mechanical) return "mechanical";
  // No explicit signal: treat as taste so it surfaces rather than silently auto-deciding.
  return "taste";
}

/** Map a decision class to its HITL routing verdict. Pure, total. */
export function routeDecision(decisionClass: DecisionClass): DecisionRoute {
  switch (decisionClass) {
    case "mechanical":
      return { autoDecide: true, surfaceAtFinalGate: false, alwaysAsk: false };
    case "taste":
      return { autoDecide: true, surfaceAtFinalGate: true, alwaysAsk: false };
    case "user-challenge":
      return { autoDecide: false, surfaceAtFinalGate: false, alwaysAsk: true };
  }
}

const ROUTE_PHRASE: Record<DecisionClass, string> = {
  mechanical: "auto-deciding silently (one right answer)",
  taste: "auto-deciding — will surface at the final gate (viable alternatives)",
  "user-challenge": "asking the operator — this overrides your stated direction",
};

/** One-line note describing the decision + its route. Mirrors buildSelfMonitorText. Pure. */
export function buildDecisionNote(context: DecisionContext): string {
  const decisionClass = classifyDecision(context);
  const route = ROUTE_PHRASE[decisionClass];
  const glyph = decisionClass === "user-challenge" ? "⚠" : "·";
  return `${glyph} Decision [${decisionClass}]: ${route}.`;
}
