// ANTI-SLOP: detect AI-ish writing drift in Vanta's own responses.
// Pure — no I/O. Pairs with SELF-EVAL (different axis: voice vs correctness).
// Flags sycophancy, buzzwords, empty filler, and AI-magic phrasing.

export type SlopKind =
  | "sycophancy"       // "Great question!" / "Happy to help!"
  | "ai-magic"         // "As an AI" / "my training"
  | "corporate"        // "leverage", "synergy", "actionable insights"
  | "empty-filler"     // "That said," / "It's worth noting"
  | "fake-closing"     // "I hope this helps" / "Let me know"
  | "overcautious";    // "I should mention" / "Please note that"

export type SlopHit = {
  kind: SlopKind;
  phrase: string;
  fix: string;
};

type Rule = { kind: SlopKind; patterns: RegExp[]; fix: string };

const RULES: Rule[] = [
  {
    kind: "sycophancy",
    patterns: [
      /\b(great question|excellent question|good question)/i,
      /\b(happy to help|glad to help|delighted to|absolutely!|certainly!|of course!)/i,
      /\b(i'd be (happy|glad|pleased) to)/i,
    ],
    fix: "drop the preamble — start with the answer",
  },
  {
    kind: "ai-magic",
    patterns: [
      /\bas an (ai|language model|assistant)\b/i,
      /\bmy (training|knowledge base|capabilities)\b/i,
      /\b(i cannot|i am unable to|i don't have the ability)\b/i,
    ],
    fix: "speak plainly — no AI-identity hedging",
  },
  {
    kind: "corporate",
    patterns: [
      /\b(leverage|utiliz[es]|synerg|touch ?point|action ?able insight|game.?changer|revolutionar)/i,
      /\b(paradigm shift|move the needle|circle back|holistic approach|best practice)\b/i,
      /\b(robust solution|scalable|seamless(ly)?|end.to.end|thought leader)/i,
    ],
    fix: "use plain verbs — replace buzzword with what you mean",
  },
  {
    kind: "empty-filler",
    patterns: [
      /\b(that said,|with that said,|having said that)/i,
      /\b(it('s| is) (worth noting|important to note)|it should be noted)\b/i,
      /\b(at the end of the day|all things considered|in the grand scheme)/i,
    ],
    fix: "cut the filler — say the thing directly",
  },
  {
    kind: "fake-closing",
    patterns: [
      /\b(i hope this (helps|clarifies|answers)|hope that helps)\b/i,
      /\b(let me know if you (need|have)|feel free to (ask|reach out))\b/i,
      /\b(don't hesitate to|please don't hesitate)\b/i,
    ],
    fix: "end on the last real point — no service-desk sign-off",
  },
  {
    kind: "overcautious",
    patterns: [
      /\b(please note that|important(ly)?:? |disclaimer:|i should (mention|note))\b/i,
      /\bkindly (note|be aware)\b/i,
    ],
    fix: "say it flat — drop the warning wrapper",
  },
];

/** Find slop hits in a text. Pure. Returns [] when clean. */
export function detectSlop(text: string): SlopHit[] {
  const hits: SlopHit[] = [];
  const seen = new Set<SlopKind>();
  for (const rule of RULES) {
    if (seen.has(rule.kind)) continue;
    for (const pat of rule.patterns) {
      const m = pat.exec(text);
      if (m) {
        hits.push({ kind: rule.kind, phrase: m[0], fix: rule.fix });
        seen.add(rule.kind);
        break;
      }
    }
  }
  return hits;
}

/**
 * Format a note for detected slop hits. Returns null when clean.
 * Format: `  ⚠ slop: <kind>: "<phrase>" — <fix>`
 */
export function formatSlopNote(hits: SlopHit[]): string | null {
  if (!hits.length) return null;
  const lines = hits.map((h) => `  ⚠ slop [${h.kind}]: "${h.phrase}" — ${h.fix}`);
  return lines.join("\n");
}
