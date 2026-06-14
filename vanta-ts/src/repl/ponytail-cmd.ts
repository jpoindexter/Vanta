import type { SlashHandler } from "./types.js";

// /ponytail [lite|full|ultra|off|review] — lazy-senior-dev minimalism.
//
// lite|full|ultra : inject a persistent minimalism directive into the live
//                   system prompt at that intensity (mirrors /planmode's marker).
// off             : remove it.
// review          : one-shot deletion pass over the current diff (resend).
// (no arg / "on")  : full.
//
// The skill `ponytail` (skills-library/ponytail) carries the same philosophy for
// on-demand recall + Claude Code; this command makes it a session MODE.
// Adapted from ponytail (MIT, github.com/DietrichGebert/ponytail).

export const PONYTAIL_MARKER = "<!-- ponytail-mode -->";
const PONYTAIL_END = "<!-- /ponytail-mode -->";

export type PonytailIntensity = "lite" | "full" | "ultra";

/** Parse the command arg → an action. Unknown / empty / "on" → full. Pure. */
export function parsePonytailArg(arg: string): PonytailIntensity | "off" | "review" {
  const a = arg.trim().toLowerCase();
  if (a === "review") return "review";
  if (a === "off") return "off";
  if (a === "lite" || a === "ultra") return a;
  return "full";
}

const INTRO: Record<PonytailIntensity, string> = {
  lite: "🐴 Ponytail (lite): prefer the smallest solution that works; avoid needless abstractions and dependencies.",
  full: "🐴 Ponytail (full): you are a lazy senior developer — the best code is the code never written.",
  ultra:
    "🐴 Ponytail (ultra): default to NOT building. Every line must justify itself. Lead with the one-line / stdlib / delete option; expand only if the user pushes back. Actively propose deletions.",
};

const CORE = `The ladder — stop at the first rung that holds: 1. Does this need to exist? (YAGNI)  2. Stdlib does it? Use it.  3. Native platform feature? Use it.  4. Already-installed dependency? Use it.  5. One line? Make it one line.  6. Only then: the minimum that works.
No unrequested abstractions, no avoidable dependency, deletion over addition, fewest files. Question complex asks ("need X, or does Y cover it?"). Mark intentional shortcuts with a \`ponytail:\` comment naming the ceiling + upgrade path. NOT lazy about: input validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything explicitly requested — non-trivial logic leaves one runnable check behind.`;

/** The directive block injected into the system prompt. Pure. */
export function buildDirective(intensity: PonytailIntensity): string {
  return `\n\n${PONYTAIL_MARKER}\n${INTRO[intensity]}\n\n${CORE}\n${PONYTAIL_END}`;
}

/** Remove any existing ponytail directive block + the separator it injected. Pure, idempotent. */
export function stripDirective(content: string): string {
  let start = content.indexOf(PONYTAIL_MARKER);
  if (start === -1) return content;
  const end = content.indexOf(PONYTAIL_END, start);
  if (end === -1) return content;
  while (start > 0 && content[start - 1] === "\n") start--; // eat the leading "\n\n" buildDirective added
  return content.slice(0, start) + content.slice(end + PONYTAIL_END.length);
}

export const REVIEW_RUBRIC =
  "Review the current code changes for OVER-ENGINEERING ONLY — not correctness (use /review for bugs). " +
  "First get the diff: `git diff HEAD`. One line per finding: `L<line>: <tag> <what to cut> → <replacement>`. " +
  "Tags: delete (dead/speculative), stdlib (reinvented standard library), native (dep doing what the platform does), " +
  "yagni (abstraction with one caller), shrink (same logic, fewer lines). End with the net lines removable. " +
  'If nothing to cut: "Lean already. Ship."';

export const ponytail: SlashHandler = (arg, ctx) => {
  const action = parsePonytailArg(arg);
  if (action === "review") return { resend: REVIEW_RUBRIC };
  const sys = ctx.convo.messages[0];
  if (!sys || sys.role !== "system") return { output: "  ponytail unavailable (no system message in conversation)" };
  const wasOn = sys.content.includes(PONYTAIL_MARKER);
  sys.content = stripDirective(sys.content);
  if (action === "off") {
    return { output: wasOn ? "  · ponytail mode OFF — normal coding again" : "  · ponytail mode already off" };
  }
  sys.content += buildDirective(action);
  return {
    output: `  🐴 ponytail ${action} mode ON — stdlib > deps, deletion > addition, the minimum that works. /ponytail off to stop · /ponytail review to audit changes.`,
  };
};
