// VOICE-CALIBRATION: a pure post-turn check that flags sycophantic
// over-validation in Vanta's own output — praise that isn't earned.
// Three axes: opening flattery, unqualified superlatives, and empty agreement.
// Pure (no I/O, no LLM), best-effort, never blocks. Mirrors self-monitor's shape.
//
// Distinct from anti-slop.ts: that gate scans general AI-writing drift
// (buzzwords, fake closings, filler); this one targets *praise calibration* —
// the teammate-voice failure where enthusiasm outruns merit.

export type SycophancyKind =
  | "opening-flattery"     // turn opens by praising the user/idea, not answering
  | "unqualified-superlative" // "perfect"/"brilliant"/"amazing" with no reasoning
  | "empty-agreement";     // "you're absolutely right"-style validation, no substance

export type VoiceHit = { kind: SycophancyKind; phrase: string; reason: string };

type Rule = { kind: SycophancyKind; patterns: RegExp[]; reason: string };

// Opening flattery: only fires near the start of the turn (the answer should
// lead, not the praise). The opener slice is checked separately.
const OPENING: RegExp[] = [
  /^(that('s| is)|what) an? (great|excellent|fantastic|brilliant|amazing|wonderful|perfect|insightful|smart|clever)\b/i,
  /^(great|excellent|fantastic|brilliant|amazing|wonderful|perfect|love it|nice|awesome)[!.,]/i,
  /^(i (love|really like)|love) (this|that|your|the) (idea|approach|plan|question|point)\b/i,
  /^you('re| are) (absolutely|totally|completely|so) right\b/i,
  /^(good|great|excellent) (question|point|call|idea|catch|thinking)\b/i,
];

const RULES: Rule[] = [
  {
    kind: "unqualified-superlative",
    // A superlative applied to the user's idea/work with no "because"/reasoning
    // attached anywhere — praise as a verdict, not an assessment.
    patterns: [
      /\b(that('s| is)|this (is|looks)) (perfect|brilliant|genius|flawless|amazing|incredible|excellent|fantastic)\b/i,
      /\b(absolutely|totally|100%|completely) (right|correct|perfect|brilliant)\b/i,
      /\byour (idea|plan|approach|code|solution) is (perfect|brilliant|flawless|amazing|great)\b/i,
    ],
    reason: "praise a verdict, not an assessment — qualify it (why) or push back",
  },
  {
    kind: "empty-agreement",
    patterns: [
      /\byou('re| are) (absolutely|completely|totally|so) right\b/i,
      /\b(i (completely|totally|wholeheartedly) agree|couldn't agree more)\b/i,
      /\b(great|excellent|brilliant|fantastic) (idea|point|thinking|insight|question)\b/i,
      /\b(spot on|nailed it|exactly right|so true)\b/i,
    ],
    reason: "empty validation — earn the praise with a reason or surface a caveat",
  },
];

/** The opening slice of a turn: leading whitespace stripped, first sentence/clause. */
function opener(text: string): string {
  return text.trimStart().slice(0, 140);
}

/** True when the turn opens with flattery rather than the answer. Pure. */
export function hasOpeningFlattery(text: string): boolean {
  const head = opener(text);
  return OPENING.some((p) => p.test(head));
}

/**
 * Find sycophantic over-validation hits in a text. Pure — no I/O.
 * Returns [] when the text reads calibrated/critical. At most one hit per kind.
 */
export function detectSycophancy(text: string): VoiceHit[] {
  const hits: VoiceHit[] = [];
  if (hasOpeningFlattery(text)) {
    const phrase = opener(text).split(/[.!?\n]/)[0]?.trim() ?? "";
    hits.push({
      kind: "opening-flattery",
      phrase,
      reason: "lead with the answer, not praise — earn enthusiasm, don't open with it",
    });
  }
  for (const rule of RULES) {
    for (const pat of rule.patterns) {
      const m = pat.exec(text);
      if (m) {
        hits.push({ kind: rule.kind, phrase: m[0], reason: rule.reason });
        break;
      }
    }
  }
  return hits;
}

/** True when the text shows sycophantic over-validation. Pure convenience wrapper. */
export function isSycophantic(text: string): boolean {
  return detectSycophancy(text).length > 0;
}

/**
 * Format a best-effort note for sycophancy hits. Returns null when calibrated.
 * Format: `  ⚠ voice [<kind>]: "<phrase>" — <reason>`
 */
export function buildVoiceCheckText(hits: VoiceHit[]): string | null {
  if (!hits.length) return null;
  return hits.map((h) => `  ⚠ voice [${h.kind}]: "${h.phrase}" — ${h.reason}`).join("\n");
}
