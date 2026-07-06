// HARNESS-SKILL-GATING — two guards around loading/offering a skill:
//   (1) offer-time GATING — a skill declares prerequisites (platforms, env vars,
//       commands); it's offered only where they're satisfied, so a mac-only or
//       key-requiring skill never shows up unusable.
//   (2) injection SCAN — a skill/plugin body is scanned for prompt-injection
//       patterns before load (trusted-operator posture: skill content is an
//       author/LLM boundary, not implicitly trusted).
// Pure; no I/O. The store/selector wire these in.

// ── Offer-time gating ──────────────────────────────────────────────────────

export type SkillPrereqs = {
  /** OS platforms the skill supports (node `process.platform` values). Empty = any. */
  platforms: string[];
  /** Env vars that MUST be set for the skill to function. */
  envVars: string[];
  /** CLI commands the skill needs on PATH. */
  commands: string[];
};

function toList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

/** Extract declared prerequisites from a skill's raw frontmatter. Pure. */
export function parseSkillPrereqs(frontmatter: Record<string, unknown>): SkillPrereqs {
  return {
    platforms: toList(frontmatter.platforms ?? frontmatter.platform),
    envVars: toList(frontmatter.env_vars ?? frontmatter.requiresEnv),
    commands: toList(frontmatter.commands ?? frontmatter.requiresCommands),
  };
}

export type GateContext = {
  platform: string;
  env: NodeJS.ProcessEnv;
  /** Does this command exist on PATH? Injected (real check is I/O). */
  hasCommand: (cmd: string) => boolean;
};

export type GateVerdict = { offered: true } | { offered: false; reason: string };

/**
 * Decide whether a skill may be offered here: its platform matches (or it
 * declares none), every required env var is set, every required command is on
 * PATH. The FIRST unmet prerequisite is the reason. Pure over the injected ctx.
 */
export function gateSkill(prereqs: SkillPrereqs, ctx: GateContext): GateVerdict {
  if (prereqs.platforms.length && !prereqs.platforms.includes(ctx.platform)) {
    return { offered: false, reason: `needs platform ${prereqs.platforms.join("/")} (here: ${ctx.platform})` };
  }
  const missingEnv = prereqs.envVars.find((v) => !ctx.env[v]);
  if (missingEnv) return { offered: false, reason: `needs env ${missingEnv}` };
  const missingCmd = prereqs.commands.find((c) => !ctx.hasCommand(c));
  if (missingCmd) return { offered: false, reason: `needs command "${missingCmd}" on PATH` };
  return { offered: true };
}

// ── Injection scan ─────────────────────────────────────────────────────────

// Known prompt-injection shapes. Each pattern is a keyword bank tuned to catch
// intent, not incidental prose (a skill legitimately ABOUT prompt injection is a
// judgement call the caller makes on the hit list — the scan flags, doesn't ban).
const INJECTION_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["override-instructions", /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|your)\b[^.\n]{0,20}\b(instruction|prompt|rule|context|direction)/i],
  ["reveal-system-prompt", /\b(reveal|print|show|repeat|output|leak)\b[^.\n]{0,30}\b(system|initial|hidden|original)\b[^.\n]{0,15}\b(prompt|instruction|message)/i],
  ["role-hijack", /\byou are now\b|\bact as (an?|the)\b[^.\n]{0,30}\b(unrestricted|jailbroken|DAN|no rules|without restriction)/i],
  ["exfil-secrets", /\b(send|post|upload|exfiltrat|leak|email)\b[^.\n]{0,40}\b(api[_ ]?key|secret|token|password|credential|\.env|private key)/i],
  ["hidden-directive", /[​-‏‪-‮⁠﻿]/], // zero-width / bidi control chars
  ["fake-tool-call", /\b(call|invoke|execute|run)\b[^.\n]{0,20}\b(shell_cmd|write_file|rm -rf)\b|\bcurl\b[^\n]*\|\s*sh\b|\brm -rf\b/i],
];

export type InjectionScan = { clean: boolean; hits: string[] };

/** Scan skill/plugin content for prompt-injection patterns. Pure, never throws. */
export function scanForInjection(text: string): InjectionScan {
  const hits = INJECTION_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
  return { clean: hits.length === 0, hits };
}
