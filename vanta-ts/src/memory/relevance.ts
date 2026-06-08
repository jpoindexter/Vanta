// MEM-RELEVANCE: classify what deserves durable memory vs ephemeral noise.
// Pure heuristics — no LLM call, no I/O. Fast enough to gate every write.
// Callers: appendMemory, brain tool write path, and any future memory ingest.

export type MemoryClass =
  | "durable-preference"    // a user preference, style, or constraint
  | "durable-constraint"    // a hard rule the agent must follow
  | "durable-fact"          // a stable external fact
  | "recurring-workflow"    // a repeated process the user does
  | "correction"            // user corrected the agent — preserve the lesson
  | "project-state"         // current status of ongoing work (stale-quickly)
  | "ephemeral-detail"      // task-local, won't matter next session
  | "noise"                 // chitchat, filler, no future value
  | "sensitive";            // private data that should not be stored

export type ClassifyResult = {
  class: MemoryClass;
  durable: boolean; // true = write to long-term memory; false = skip or session-only
  reason: string;
};

// Signal lists — pattern-matched against lowercased text.
const SENSITIVE_PATTERNS = [
  /\bpassword\b/, /\bsecret\b/, /\bapi.?key\b/, /\btoken\b/,
  /\bcredit.?card\b/, /\bssn\b/, /\bsocial.?security\b/, /\bbirthday\b/,
  /\bprivate.?key\b/, /\b-----begin\b/,
];

const NOISE_PATTERNS = [
  /^(ok|okay|yes|no|sure|thanks|thank you|got it|cool|great|np|lol)\b/,
  /^(can you|could you|please|just)\b.{0,20}$/,
];

const CORRECTION_PATTERNS = [
  /\b(wrong|incorrect|mistake|error|no,|actually|that's not|don't do that|stop doing)\b/,
  /\b(you should|you shouldn't|always|never|instead)\b/,
  /\b(fix that|remember to|make sure|don't forget)\b/,
];

const PREFERENCE_PATTERNS = [
  /\b(i (like|prefer|want|hate|love|dislike)|my (style|preference|default))\b/,
  /\b(always use|never use|use .+ not|stick to|keep using)\b/,
  /\b(for me|in my projects?|in my workflow)\b/,
];

const CONSTRAINT_PATTERNS = [
  /\b(must|must not|cannot|should always|should never|required|forbidden|rule:)\b/,
  /\b(never push|never commit|never delete|never send|always approval)\b/,
];

const WORKFLOW_PATTERNS = [
  /\b(every time|each time|whenever|workflow|process|routine|checklist|script)\b/,
  /\b(before (deploy|push|commit|merge)|after (review|test|build))\b/,
  /\b(my (process|flow|routine|habit|pattern))\b/,
];

const FACT_PATTERNS = [
  /\b(my (name|company|project|stack|repo|org)|i (am|work|live|use|run))\b/,
  /\b(the (project|repo|stack|codebase) (is|uses|runs))\b/,
];

const PROJECT_STATE_PATTERNS = [
  /\b(in progress|wip|blocked on|almost done|shipped|waiting for|next step is)\b/,
  /\b(current(ly)? (building|working on|fixing|implementing))\b/,
];

function match(text: string, patterns: RegExp[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => p.test(lower));
}

/**
 * Classify a candidate memory string. Pure — safe to call anywhere.
 * Returns `durable: false` for noise, ephemeral, and sensitive to
 * signal that callers should skip the write (or store session-only).
 */
export function classifyMemory(text: string): ClassifyResult {
  const t = text.trim();
  if (!t || t.length < 8) {
    return { class: "noise", durable: false, reason: "too short to be meaningful" };
  }

  if (match(t, SENSITIVE_PATTERNS)) {
    return { class: "sensitive", durable: false, reason: "contains sensitive data — do not store" };
  }

  // Check durable signals BEFORE noise — a correction can start with "no,"
  if (match(t, CONSTRAINT_PATTERNS)) {
    return { class: "durable-constraint", durable: true, reason: "hard rule the agent must follow" };
  }

  if (match(t, CORRECTION_PATTERNS)) {
    return { class: "correction", durable: true, reason: "user correction — preserve the lesson" };
  }

  if (match(t, NOISE_PATTERNS)) {
    return { class: "noise", durable: false, reason: "conversational filler with no future value" };
  }

  if (match(t, PREFERENCE_PATTERNS)) {
    return { class: "durable-preference", durable: true, reason: "user preference or style" };
  }

  if (match(t, WORKFLOW_PATTERNS)) {
    return { class: "recurring-workflow", durable: true, reason: "repeating workflow worth encoding" };
  }

  if (match(t, FACT_PATTERNS)) {
    return { class: "durable-fact", durable: true, reason: "stable identity or project fact" };
  }

  if (match(t, PROJECT_STATE_PATTERNS)) {
    return { class: "project-state", durable: false, reason: "project state that stales quickly — session-only" };
  }

  // Long structured content (multi-line or >80 chars) defaults to ephemeral-detail
  // rather than noise so callers can choose to keep it for the session.
  if (t.length > 80 || t.includes("\n")) {
    return { class: "ephemeral-detail", durable: false, reason: "task-local detail, unlikely to matter next session" };
  }

  return { class: "noise", durable: false, reason: "no durable signal detected" };
}

/**
 * Gate: should this text be written to long-term (durable) memory?
 * Use at every appendMemory / brain-write call site.
 */
export function shouldStoreDurably(text: string): boolean {
  return classifyMemory(text).durable;
}
