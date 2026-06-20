// PAPER-AUTO-CLASSIFIER — an OPTIONAL advisory classifier that can only TIGHTEN a
// permission decision (allow → ask/block, ask → block), never loosen it. It runs
// last in the safety chain (after kernel → rules → auto-mode → operator-profile)
// as a second opinion on actions the kernel allowed but that carry risk signals
// the kernel's keyword pass doesn't weight. Disabled by default
// (VANTA_AUTO_CLASSIFIER); behavior-preserving when off. The scorer is injectable
// so a real ML model can replace the heuristic later without touching the gate.

export type Decision = "allow" | "ask" | "block";
const RANK: Record<Decision, number> = { allow: 0, ask: 1, block: 2 };

/** The stricter of two decisions (higher rank wins). Pure — the tighten-only core. */
export function stricter(a: Decision, b: Decision): Decision {
  return RANK[b] > RANK[a] ? b : a;
}

export function classifierEnabled(env: NodeJS.ProcessEnv): boolean {
  const v = (env.VANTA_AUTO_CLASSIFIER ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export type RiskScore = { score: number; reasons: string[] };
export type RiskScorer = (action: string) => RiskScore;

// Risk signals the kernel's allow tail may pass but that warrant a second look.
const RISKY_PATTERNS: { re: RegExp; weight: number; why: string }[] = [
  { re: /\b(sudo|doas)\b/i, weight: 3, why: "privilege escalation" },
  { re: /\|\s*(sh|bash|zsh)\b/i, weight: 3, why: "pipe to shell" },
  { re: /\bcurl\b[^|]*\|/i, weight: 3, why: "curl-to-pipe" },
  { re: /\b(DROP\s+TABLE|TRUNCATE\b|DELETE\s+FROM)\b/i, weight: 3, why: "destructive SQL" },
  { re: /\brm\b[^\n]*-[a-z]*r/i, weight: 2, why: "recursive delete" },
  { re: /\b(chmod|chown)\b[^\n]*(\b777\b|-R)/i, weight: 2, why: "broad permission change" },
  { re: /\bgit\b[^\n]*(push[^\n]*--force|reset[^\n]*--hard|filter-branch)/i, weight: 2, why: "force/history git" },
  { re: /\b(eval|exec)\s*\(/i, weight: 2, why: "dynamic eval" },
  { re: /base64\s+-d|atob\(/i, weight: 1, why: "decoded payload" },
];

/** Default heuristic scorer — sums matched-pattern weights. Pure, deterministic. */
export function defaultRiskScorer(action: string): RiskScore {
  let score = 0;
  const reasons: string[] = [];
  for (const p of RISKY_PATTERNS) {
    if (p.re.test(action)) {
      score += p.weight;
      reasons.push(p.why);
    }
  }
  return { score, reasons };
}

/** Map a risk score to a suggested decision. score≥3 → block, ≥1 → ask, else allow. */
function suggestedDecision(score: number): Decision {
  if (score >= 3) return "block";
  if (score >= 1) return "ask";
  return "allow";
}

/**
 * Advisory tighten: never returns a decision looser than `input.decision`. When the
 * classifier is more cautious than the current decision, it escalates and explains;
 * otherwise it returns the input unchanged. Pure (scorer injected).
 */
export function classifyTighten(
  input: { decision: Decision; toolName: string; action: string },
  scorer: RiskScorer = defaultRiskScorer,
): { decision: Decision; reason: string } {
  const { score, reasons } = scorer(input.action);
  const final = stricter(input.decision, suggestedDecision(score));
  if (final === input.decision) return { decision: input.decision, reason: "advisory classifier: no change" };
  return { decision: final, reason: `advisory classifier tightened to ${final}: ${reasons.join(", ")}` };
}
