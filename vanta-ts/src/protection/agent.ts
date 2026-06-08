// PROTECTION-AGENT: active guard against scams, privacy risks, unsafe commands,
// manipulative content, and agent overreach. Extends the kernel safety classifier
// from passive gate to active review. Pure detection functions for offline testing.

export type ThreatKind =
  | "scam"           // phishing, impersonation, too-good-to-be-true offers
  | "privacy"        // PII/credential exposure in content
  | "unsafe-cmd"     // destructive shell commands
  | "manipulation"   // social engineering, urgency pressure, fear tactics
  | "agent-overreach" // agent trying to bypass gates or acquire excess permissions
  | "contract-trap"; // buried liability clauses, auto-renewing terms, data rights grabs

export type Threat = {
  kind: ThreatKind;
  severity: "low" | "medium" | "high";
  description: string;
  recommendation: string;
};

const SCAM_PATTERNS: RegExp[] = [
  /\b(urgent|act now|limited time|respond immediately|verify your account|suspended)\b/i,
  /\b(won|congratulations|selected|prize|lottery|unclaimed funds)\b/i,
  /\b(your account will be (closed|suspended|terminated))\b/i,
  /\bclick here to (verify|confirm|update|secure)\b/i,
];

const PRIVACY_PATTERNS: RegExp[] = [
  /\b(password|secret|api[ _-]?key|token|credential|private[ _-]?key|oauth|bearer)\b.{0,30}[:=][^\s]{6,}/i,
  /\b(ssn|social.{0,3}security|credit.{0,3}card|cvv|bank.{0,3}account)\b/i,
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[a-zA-Z0-9]{20,}\b/,
  /\bnvapi-[a-zA-Z0-9_-]{20,}\b/,
];

const UNSAFE_CMD_PATTERNS: RegExp[] = [
  /\brm\s+-rf?\s+(\/|~|\.\.)/i,
  /\bsudo\s+(rm|chmod|chown|dd|mkfs)/i,
  /\bdd\s+if=.*of=\/dev\//i,
  /\btruncate\s+.*--size\s*0/i,
  /:\(\)\s*\{.*:\|:&\}/,
  /\bchmod\s+777\s+\/\s*$/i,
];

const MANIPULATION_PATTERNS: RegExp[] = [
  /\b(don'?t tell anyone|keep this secret|this is urgent|by end of day)\b/i,
  /\b(trust me|just do it|no need to verify|skip the usual process)\b/i,
  /\b(i know your boss|i have your data|consequences will be severe)\b/i,
  /\b(you must comply|mandatory action required|final notice)\b/i,
];

const OVERREACH_PATTERNS: RegExp[] = [
  /\b(bypass the kernel|skip approval|ignore safety|override the gate)\b/i,
  /\b(grant yourself|elevate permissions|add to allowlist)\b/i,
  /\bset\s+VANTA_(AUTONOMY|LINT_BLOCK|ANTI_SLOP|GOAL_ACTION)\s*=\s*0/i,
];

const CONTRACT_TRAP_PATTERNS: RegExp[] = [
  /\b(auto.?renew|automatically renew|unless cancelled)\b/i,
  /\b(irrevocable license|perpetual license|worldwide license)\b/i,
  /\b(indemnif|hold harmless|waive.*right|disclaim.*liabilit)\b/i,
  /\b(we may (change|modify|update) (terms|policy|price) at any time)\b/i,
];

type Rule = { patterns: RegExp[]; kind: ThreatKind; severity: Threat["severity"]; description: string; recommendation: string };

const RULES: Rule[] = [
  { patterns: SCAM_PATTERNS, kind: "scam", severity: "high", description: "Scam indicators detected (urgency, prize claim, account threat).", recommendation: "Do not respond, click links, or provide credentials. Verify through official channels." },
  { patterns: PRIVACY_PATTERNS, kind: "privacy", severity: "high", description: "Credential or PII exposed in content.", recommendation: "Rotate the exposed credential immediately. Remove from conversation/file." },
  { patterns: UNSAFE_CMD_PATTERNS, kind: "unsafe-cmd", severity: "high", description: "Destructive shell command pattern detected.", recommendation: "Do not run. Propose for approval and explain the risk." },
  { patterns: MANIPULATION_PATTERNS, kind: "manipulation", severity: "medium", description: "Social engineering / pressure tactics detected.", recommendation: "Slow down. Verify the request through an independent channel before acting." },
  { patterns: OVERREACH_PATTERNS, kind: "agent-overreach", severity: "high", description: "Instruction appears to direct an agent to bypass safety controls.", recommendation: "Refuse. Escalate to the user. Log the attempt." },
  { patterns: CONTRACT_TRAP_PATTERNS, kind: "contract-trap", severity: "medium", description: "Contract clause that may create unwanted obligations (auto-renew, broad license, indemnity).", recommendation: "Flag for legal review before signing/accepting." },
];

/** Scan text for threats. Pure — no I/O. */
export function scanForThreats(text: string): Threat[] {
  const threats: Threat[] = [];
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      threats.push({ kind: rule.kind, severity: rule.severity, description: rule.description, recommendation: rule.recommendation });
    }
  }
  return threats;
}

/** Format a threat report for display. Pure. */
export function formatThreatReport(threats: Threat[]): string {
  if (!threats.length) return "✓ no threats detected";
  const lines = threats.map((t) => `  [${t.severity.toUpperCase()}] ${t.kind}: ${t.description}\n    → ${t.recommendation}`);
  return `⚠ ${threats.length} threat(s) detected:\n${lines.join("\n")}`;
}
