import type { EfGate, EfSignals, GateMemory, SensoryLoad, TimeSupportStyle } from "./types.js";

// The nine ND executive-function gates as small pure rules. Each reads the turn
// signals + its own accumulator and may emit one short, user-facing nudge.
// Nudges are supports, never blocks — the host surfaces them as notes.

const FIRES_ON_MULTIPLE = (n: number, t: number): boolean => t > 0 && n > 0 && n % t === 0;
const primaryTool = (names: string[]): string | null => {
  if (!names.length) return null;
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
};
const isReadOnly = (s: EfSignals): boolean => !s.wroteFiles && !s.committed;
const goalLine = (g: string | null): string => (g ? `\n  goal: "${g}"` : "");

const COMPLEXITY_SIGNALS = [/refactor/i, /rewrite/i, /\bschema\b/i, /migrat/i, /multi[- ]?file/i, /not sure/i, /architecture/i, /redesign/i];
const INITIATION_SIGNALS = [/don'?t know where to (start|begin)/i, /where do i (start|begin)/i, /not sure how to start/i, /help me start/i, /can'?t get started/i];

/** Count distinct complexity signals in a message. */
function complexityScore(msg: string): number {
  return COMPLEXITY_SIGNALS.filter((re) => re.test(msg)).length;
}

// --- Goal-adherence (inhibit gate) helpers -------------------------------
// The strongest, lowest-false-positive drift signal is the USER re-asking: a
// counter of "am I busy?" gets fooled by an agent that runs tools nonstop while
// ignoring the actual ask. So the inhibit gate watches for a repeated / reworded
// / frustrated re-ask instead of activity.

/** Low-signal filler dropped before comparing two asks. */
const ASK_STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "for", "and", "or", "is", "it", "this", "that", "i", "u",
  "you", "we", "me", "my", "can", "do", "did", "how", "what", "why", "please", "pls",
  "just", "now", "get", "got", "one", "some", "me", "us",
]);

/** Content tokens of an ask, minus punctuation and filler. */
function askTokens(msg: string): Set<string> {
  const out = new Set<string>();
  for (const w of msg.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
    if (w.length > 1 && !ASK_STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

/** Two asks "echo" when their content tokens overlap heavily (Jaccard ≥ 0.6). */
function asksEcho(a: string, b: string): boolean {
  const ta = askTokens(a), tb = askTokens(b);
  if (!ta.size || !tb.size) return false;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter) >= 0.6;
}

/** Phrases that mean "you already had this ask and didn't deliver." */
const FRUSTRATION_SIGNALS = [
  /asked (you|u)\b/i, /told (you|u)\b/i, /listen(ing|ed)?\b/i, /same (thing|question)/i,
  /\b\d+\s*times\b/i, /already (said|told|asked)/i, /keep (asking|saying|telling)/i,
  /still (not|haven'?t)/i, /for the \w+ time/i,
];
const isFrustratedReask = (msg: string): boolean => FRUSTRATION_SIGNALS.some((re) => re.test(msg));

/** Bound an echoed ask quoted back inside a nudge. */
const clipAsk = (s: string, max = 120): string => (s.length > max ? s.slice(0, max - 1) + "…" : s);

export const GATES: readonly EfGate[] = [
  {
    id: "research",
    label: "research-gate — nudge after N read-only/analysis turns",
    defaultEnabled: true,
    defaultThreshold: 8,
    evaluate(s, prev, t) {
      const n = isReadOnly(s) ? prev.n + 1 : 0;
      const fire = FIRES_ON_MULTIPLE(n, t);
      return {
        next: { n, last: fire ? s.turnIndex : prev.last, mark: null },
        nudge: fire ? `🔎 ${n} turns of reading/analysis without building anything.${goalLine(s.activeGoalText)}\n  Pick one finding to act on now?` : null,
      };
    },
  },
  {
    id: "complexity",
    label: "complexity-gate — suggest planning before a complex task",
    defaultEnabled: true,
    defaultThreshold: 2, // minimum complexity signals
    evaluate(s, prev, t) {
      if (!s.lastUserMessage.trim() || t <= 0) return { next: prev, nudge: null };
      const score = complexityScore(s.lastUserMessage);
      const fire = score >= t && prev.last !== s.turnIndex;
      return {
        next: { n: score, last: fire ? s.turnIndex : prev.last, mark: null },
        nudge: fire ? `🧭 This looks multi-part (${score} complexity signals). Want to plan it first (/planmode) before diving in?` : null,
      };
    },
  },
  {
    id: "task-initiation",
    label: "task-initiation — prescribe the smallest first step on a stall",
    defaultEnabled: true,
    defaultThreshold: 1,
    evaluate(s, prev, t) {
      if (t <= 0 || !INITIATION_SIGNALS.some((re) => re.test(s.lastUserMessage))) return { next: prev, nudge: null };
      if (prev.last === s.turnIndex) return { next: prev, nudge: null };
      return {
        next: { n: prev.n + 1, last: s.turnIndex, mark: null },
        nudge: `▶ Starting is the hard part. The single smallest first step:${goalLine(s.activeGoalText)}\n  name one concrete file/command and I'll do just that.`,
      };
    },
  },
  {
    id: "hyperfocus",
    label: "hyperfocus-guard — name a long single-area run, offer an exit",
    defaultEnabled: true,
    defaultThreshold: 12,
    evaluate(s, prev, t) {
      const tool = primaryTool(s.toolNames);
      const n = tool && tool === prev.mark ? prev.n + 1 : tool ? 1 : prev.n;
      const fire = FIRES_ON_MULTIPLE(n, t);
      return {
        next: { n, last: fire ? s.turnIndex : prev.last, mark: tool ?? prev.mark },
        nudge: fire ? `🌀 ${n} turns deep in \`${tool}\` without stepping back.${goalLine(s.activeGoalText)}\n  Still the right thread? (good moment to checkpoint or switch.)` : null,
      };
    },
  },
  {
    id: "time-blindness",
    label: "time-blindness — surface elapsed time periodically",
    defaultEnabled: false,
    defaultThreshold: 45, // minutes
    evaluate(s, prev, t) {
      if (t <= 0) return { next: prev, nudge: null };
      const bucket = Math.floor(s.elapsedMin / t);
      const fire = bucket > 0 && bucket !== prev.last;
      return {
        next: { n: bucket, last: fire ? bucket : prev.last, mark: null },
        nudge: fire ? `⏱ ${Math.round(s.elapsedMin)} min on this session.${goalLine(s.activeGoalText)}\n  Worth a checkpoint or a break?` : null,
      };
    },
  },
  {
    id: "closure",
    label: "closure-gate — flag uncommitted in-progress work",
    defaultEnabled: true,
    defaultThreshold: 3, // uncommitted writes
    evaluate(s, prev, t) {
      const n = s.committed ? 0 : s.wroteFiles ? prev.n + 1 : prev.n;
      const fire = s.wroteFiles && FIRES_ON_MULTIPLE(n, t);
      return {
        next: { n, last: fire ? s.turnIndex : prev.last, mark: null },
        nudge: fire ? `⛔ ${n} file edits this session without a commit. Close one out before opening more?` : null,
      };
    },
  },
  {
    id: "velocity",
    label: "velocity-check — note a high capture:ship ratio",
    defaultEnabled: false,
    defaultThreshold: 5, // captures per ship
    evaluate(s, prev, t) {
      if (t <= 0 || s.captures <= 0 || prev.last > 0) return { next: prev, nudge: null };
      const ratio = s.ships > 0 ? s.captures / s.ships : Infinity;
      if (ratio < t) return { next: prev, nudge: null };
      const r = s.ships > 0 ? `${ratio.toFixed(0)}:1` : "∞:1";
      return {
        next: { n: Math.round(ratio), last: s.turnIndex, mark: null },
        nudge: `📈 Capture:ship is ${r} (${s.captures} captured / ${s.ships} shipped). Close something before capturing more?`,
      };
    },
  },
  {
    id: "set-shift",
    label: "set-shift — break a stuck same-approach loop",
    defaultEnabled: true,
    defaultThreshold: 3,
    evaluate(s, prev, t) {
      const tool = primaryTool(s.toolNames);
      const n = tool && tool === prev.mark ? prev.n + 1 : tool ? 1 : 0;
      const fire = tool !== null && FIRES_ON_MULTIPLE(n, t);
      return {
        next: { n, last: fire ? s.turnIndex : prev.last, mark: tool },
        nudge: fire ? `↺ \`${tool}\` ${n} turns running, no breakthrough. Try a genuinely different angle?` : null,
      };
    },
  },
  {
    id: "inhibit",
    label: "inhibit — catch a repeated / unheard ask (goal-adherence)",
    defaultEnabled: true,
    defaultThreshold: 1, // fire on the FIRST repeat — never make the user ask twice
    evaluate(s, prev, t) {
      const ask = s.lastUserMessage.trim();
      // No fresh ask this turn (autonomous run / resend): hold state, stay quiet.
      if (!ask || t <= 0) return { next: prev, nudge: null };
      // A re-ask is the drift signal: an explicit frustration cue ("i asked you 4
      // times") or the same ask reworded (`mark` holds the previous ask). Distinct
      // asks reset the streak but are still remembered for the next comparison.
      const reasked = isFrustratedReask(ask) || (prev.mark !== null && asksEcho(ask, prev.mark));
      const n = reasked ? prev.n + 1 : 0;
      const next: GateMemory = { n, last: reasked ? s.turnIndex : prev.last, mark: ask };
      if (n < t) return { next, nudge: null };
      const nudge =
        n >= 2
          ? `⛔ The user has asked this ${n + 1}× now — you are NOT doing what they asked:\n  "${clipAsk(ask)}"\n  Drop every other thread. Do exactly this now, or say plainly why you can't.`
          : `⚠ The user just repeated their ask — you drifted off it:\n  "${clipAsk(ask)}"\n  Re-anchor on THIS message, not an earlier thread. Answer it directly.`;
      return { next, nudge };
    },
  },
];

/** Gate lookup by id. */
export const GATE_BY_ID: Readonly<Record<string, EfGate>> = Object.fromEntries(GATES.map((g) => [g.id, g]));

// ---------------------------------------------------------------------------
// Preference → nudge output mappings (PURE). The EF gates always emit their
// canonical nudge; these scale the *presentation* per the user's non-gate ND
// preferences (sensory load, time support). The DEFAULT preference value is a
// byte-for-byte no-op so a balanced/medium/ranges profile sees current output.

/** The leading decoration glyph every gate nudge opens with (e.g. 🔎/🧭/⏱). */
const NUDGE_GLYPH = /^(\p{Extended_Pictographic}|[⏱⛔↺▶⚠])️?\s+/u;

/** The time-blindness nudge is the only one keyed to the ⏱ glyph. */
const TIME_NUDGE_PREFIX = "⏱ ";
/** The soft-range checkpoint tail the time nudge adds in `ranges` mode. */
const TIME_RANGE_TAIL = "\n  Worth a checkpoint or a break?";

/**
 * Sensory-load decoration scaling. `low` strips the leading emoji/decoration so
 * the nudge is plain text; `high` keeps everything; `medium` (DEFAULT) is the
 * unchanged current output. Pure.
 */
export function applySensoryLoad(nudge: string, load: SensoryLoad): string {
  if (load !== "low") return nudge; // medium (default) + high keep full decoration
  return nudge.replace(NUDGE_GLYPH, "");
}

/**
 * Time-support output style, applied to the time-blindness nudge only (others
 * pass through untouched). `ranges` (DEFAULT) keeps the current value + soft
 * checkpoint-or-break range framing; `points` reduces it to the single elapsed
 * value; `off` suppresses the time nudge entirely. Pure.
 */
export function applyTimeSupport(nudge: string, style: TimeSupportStyle): string {
  if (!nudge.startsWith(TIME_NUDGE_PREFIX)) return nudge; // not the time nudge
  if (style === "ranges") return nudge; // DEFAULT — unchanged
  if (style === "off") return ""; // caller drops empty nudges
  // points: keep the single elapsed value, drop the soft-range checkpoint tail.
  return nudge.endsWith(TIME_RANGE_TAIL) ? nudge.slice(0, -TIME_RANGE_TAIL.length) : nudge;
}
