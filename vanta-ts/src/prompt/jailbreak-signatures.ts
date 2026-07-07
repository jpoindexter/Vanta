// SEC-GODMODE-DETECT — DEFENSIVE-ONLY. These are DETECTION signatures for the
// obfuscation / refusal-suppression shapes jailbreak tooling uses, so the safety
// layer can recognize such attacks aimed AT Vanta (in inbound text, a skill, a
// pasted instruction). This module contains NO jailbreak capability, no bypass,
// no "how-to" — only regexes that FLAG the attack pattern. Pure; the safety
// scan folds these in as additional hits (never a capability path).

/** One detection signature: a name + the pattern that flags the attack shape. */
const SIGNATURES: ReadonlyArray<[string, RegExp]> = [
  // Named "unlock" personas jailbreak prompts invoke.
  ["persona-unlock", /\b(DAN|STAN|DUDE|developer mode|dev mode|god ?mode|jailbreak|do anything now)\b/i],
  // Explicit refusal / guardrail suppression.
  ["refusal-suppression", /\b(no (restrictions?|filters?|guidelines?|rules?)|without (restrictions?|any (filter|limit|rule))|bypass (your |the )?(safety|guard|filter|restriction)|disable (your |the )?(safety|filter|guard))/i],
  // "You have no limits / you are free / you can do anything" framing.
  ["unbounded-claim", /\byou (have no|are free|can now do anything|are not bound|have unlimited)\b/i],
  // Instruction to pretend guidelines/policies don't apply.
  ["policy-void", /\b(pretend|imagine|act as if|assume)\b[^.\n]{0,40}\b(no (policy|guideline|rule)|policies? (don'?t|do not) apply|not bound by)/i],
  // Base64 / encoded-payload smuggling ("decode and run/follow this").
  ["encoded-payload", /\b(base64|rot13|decode|from ?hex)\b[^.\n]{0,40}\b(and (then )?(run|follow|execute|obey)|instruction|payload)/i],
  // Simulation/roleplay framing used to launder disallowed output.
  ["sim-launder", /\b(hypothetically|in a fictional|for a (story|movie|novel)|role-?play)\b[^.\n]{0,40}\b(that (has|with) no (rules|limits)|ignore (safety|guidelines))/i],
];

export type JailbreakScan = { flagged: boolean; signatures: string[] };

/** Flag jailbreak/obfuscation signatures in text (detection only). Pure, never throws. */
export function detectJailbreak(text: string): JailbreakScan {
  const signatures = SIGNATURES.filter(([, re]) => re.test(text)).map(([name]) => name);
  return { flagged: signatures.length > 0, signatures };
}

/** The signature ids (for docs / the safety layer's advisory surface). Pure. */
export function jailbreakSignatureIds(): string[] {
  return SIGNATURES.map(([name]) => name);
}
