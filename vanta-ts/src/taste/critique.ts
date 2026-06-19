import { AXES, type Axis, type AxisWeights, type BrandDefaults } from "./critique-store.js";

// Pure scoring + critique core for the taste engine. No IO — given an artifact's
// text and a taste model's weights + brand defaults, produce per-axis scores
// (0..1), an aggregate, and an actionable critique. Heuristic, deterministic,
// offline-testable. The score signals direction; the notes carry the why.

const MAX_AXIS = 5;
const NOTE_CAP = 8;

/** What flavour of artifact we're judging — drives a couple of heuristics. */
export type ArtifactKind = "text" | "markdown" | "html";

export type ArtifactInput = {
  /** Raw artifact content. */
  content: string;
  kind: ArtifactKind;
};

export type CritiqueResult = {
  scores: Record<Axis, number>;
  /** Weighted aggregate, 0..1. */
  overall: number;
  notes: string[];
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

const PURPLE_GRADIENT = /gradient[^;]*\b(purple|indigo|violet)\b|\b(purple|indigo|violet)\b[^;]*gradient/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const SHADOW = /box-shadow/g;

/** Each brand-avoid rule as a label + a content predicate. Data over branches. */
const AVOID_RULES: ReadonlyArray<{ label: string; hit: (lower: string, raw: string) => boolean }> = [
  { label: "avoid: blue-to-purple gradients", hit: (l) => PURPLE_GRADIENT.test(l) },
  { label: "avoid: lorem ipsum filler that ships", hit: (l) => l.includes("lorem ipsum") },
  { label: "avoid: emoji as decoration", hit: (_l, raw) => (raw.match(EMOJI) ?? []).length >= 3 },
  { label: "avoid: drop shadows everywhere", hit: (l) => (l.match(SHADOW) ?? []).length >= 4 },
];

/** Distinct brand-avoid rules the content appears to violate. Pure. */
export function brandViolations(content: string, brand: BrandDefaults): string[] {
  const lower = content.toLowerCase();
  return AVOID_RULES.filter((r) => r.hit(lower, content)).map((r) => r.label).slice(0, brand.avoid.length);
}

function scoreClarity(content: string, notes: string[]): number {
  const sentences = content.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  const words = content.split(/\s+/).filter(Boolean);
  if (!words.length) {
    notes.push("clarity: artifact is empty — nothing to read.");
    return 0;
  }
  const avgLen = words.length / Math.max(1, sentences.length);
  let score = avgLen <= 22 ? 0.85 : avgLen <= 32 ? 0.6 : 0.35;
  if (avgLen > 32) notes.push(`clarity: sentences average ~${Math.round(avgLen)} words — break them up.`);
  if (sentences.length >= 2) score += 0.1;
  return clamp01(score);
}

function scoreUsefulness(content: string, notes: string[]): number {
  const lower = content.toLowerCase();
  const filler = ["lorem ipsum", "coming soon", "todo", "placeholder", "tbd", "lipsum"];
  const fillerHits = filler.filter((f) => lower.includes(f));
  let score = 0.7;
  if (fillerHits.length) {
    score -= 0.4;
    notes.push(`usefulness: filler/placeholder present (${fillerHits.join(", ")}) — ship real content.`);
  }
  if (content.trim().length < 40) {
    score -= 0.3;
    notes.push("usefulness: too thin to carry a point.");
  }
  return clamp01(score);
}

function scoreBeauty(content: string, brand: BrandDefaults, notes: string[]): number {
  const violations = brandViolations(content, brand);
  let score = 0.75 - violations.length * 0.18;
  for (const v of violations) notes.push(`beauty: ${v}.`);
  if (!violations.length) score += 0.1;
  return clamp01(score);
}

function scoreCredibility(content: string, notes: string[]): number {
  const lower = content.toLowerCase();
  const hype = ["revolutionary", "game-changer", "game changer", "world-class", "best-in-class", "synergy", "cutting-edge", "next-gen", "unleash", "supercharge"];
  const hypeHits = hype.filter((h) => lower.includes(h));
  let score = 0.75 - hypeHits.length * 0.12;
  if (hypeHits.length) notes.push(`credibility: hype words weaken trust (${hypeHits.slice(0, 3).join(", ")}).`);
  if (/\d/.test(content)) score += 0.1; // concrete specifics read as credible
  return clamp01(score);
}

function scoreActionability(content: string, notes: string[]): number {
  const lower = content.toLowerCase();
  const cues = ["click", "run", "open", "next step", "do this", "->", "→", "step 1", "1.", "- [ ]", "try", "install"];
  const cueHits = cues.filter((c) => lower.includes(c.toLowerCase()));
  let score = 0.45 + Math.min(0.45, cueHits.length * 0.15);
  if (!cueHits.length) notes.push("actionability: no clear next step — tell the reader what to do.");
  return clamp01(score);
}

/** Score one artifact against a taste model's weights + brand defaults. Pure. */
export function critiqueArtifact(input: ArtifactInput, weights: AxisWeights, brand: BrandDefaults): CritiqueResult {
  const notes: string[] = [];
  const content = input.content;
  const scores: Record<Axis, number> = {
    clarity: scoreClarity(content, notes),
    usefulness: scoreUsefulness(content, notes),
    beauty: scoreBeauty(content, brand, notes),
    credibility: scoreCredibility(content, notes),
    actionability: scoreActionability(content, notes),
  };
  let weightedSum = 0;
  let weightTotal = 0;
  for (const axis of AXES) {
    weightedSum += scores[axis] * weights[axis];
    weightTotal += weights[axis];
  }
  const overall = clamp01(weightedSum / Math.max(1, weightTotal));
  if (!notes.length) notes.push("on-brand and clear — no taste violations detected.");
  return { scores, overall, notes: notes.slice(0, NOTE_CAP) };
}

/** Render a 0..1 score on a 0..MAX_AXIS scale for display. Pure. */
export function axisOutOfFive(score: number): number {
  return Math.round(score * MAX_AXIS * 10) / 10;
}

/** Format a critique result as a readable block. Pure. */
export function formatCritique(artifact: string, result: CritiqueResult): string {
  const lines = AXES.map((a) => `  ${a.padEnd(14)} ${axisOutOfFive(result.scores[a])}/5`);
  return [
    `Taste critique — ${artifact}`,
    `Overall: ${axisOutOfFive(result.overall)}/5`,
    ...lines,
    "Notes:",
    ...result.notes.map((n) => `  - ${n}`),
  ].join("\n");
}

/** Compare a before/after pair on overall + per-axis deltas. Pure. */
export function formatDelta(before: CritiqueResult, after: CritiqueResult): string {
  const sign = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
  const overall = axisOutOfFive(after.overall) - axisOutOfFive(before.overall);
  const perAxis = AXES.map((a) => {
    const d = axisOutOfFive(after.scores[a]) - axisOutOfFive(before.scores[a]);
    return `  ${a.padEnd(14)} ${sign(Math.round(d * 10) / 10)}`;
  });
  return [`Overall delta: ${sign(Math.round(overall * 10) / 10)}/5`, ...perAxis].join("\n");
}
