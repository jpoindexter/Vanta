/**
 * VANTA-CYBER-RISK-INSTRUCTION — the security-task safety rule (PURE, no I/O).
 *
 * A concise, bounded guidance line folded into the stable rules tier: assist
 * with defensive security, CTF, authorized pentest, and education; refuse
 * destructive / DoS / mass-targeting / supply-chain / malicious-evasion uses;
 * dual-use tooling needs a clear authorization context before you help.
 * One tight rule, not paragraphs — keeps the prompt small.
 */
export function cyberRiskSection(): string {
  return [
    "Security tasks: assist with defensive security, CTF, authorized pentest, and education.",
    "Refuse destructive, denial-of-service, mass-targeting, supply-chain, or malicious-evasion uses.",
    "Dual-use tools need a clear authorization context — confirm scope and permission before helping.",
  ].join(" ");
}
