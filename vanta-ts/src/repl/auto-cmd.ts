import type { SlashHandler } from "./types.js";

// /auto [lite|full|ultra|off|review] — automatic minimalism: do the least that works.
//
// lite|full|ultra : inject a persistent minimalism directive into the live
//                   system prompt at that intensity (mirrors /planmode's marker).
// off             : remove it.
// review          : one-shot deletion pass over the current diff (resend).
// (no arg / "on")  : full.
//
// Mirrors the global Claude Code /auto command + ~/.claude/skills/auto; this
// makes it a session MODE inside Vanta. The skill `auto` (skills-library/auto)
// carries the same discipline for on-demand recall + Claude Code.

export const AUTO_MARKER = "<!-- auto-mode -->";
const AUTO_END = "<!-- /auto-mode -->";

export type AutoIntensity = "lite" | "full" | "ultra";

/** Parse the command arg → an action. Unknown / empty / "on" → full. Pure. */
export function parseAutoArg(arg: string): AutoIntensity | "off" | "review" {
  const a = arg.trim().toLowerCase();
  if (a === "review") return "review";
  if (a === "off") return "off";
  if (a === "lite" || a === "ultra") return a;
  return "full";
}

const INTRO: Record<AutoIntensity, string> = {
  lite: "⚙ Auto (lite): reach for the smallest solution that works; skip needless abstractions and dependencies.",
  full: "⚙ Auto (full): do the least that works — the best code is the code never written.",
  ultra:
    "⚙ Auto (ultra): default to NOT building. Every line must earn its place. Lead with the one-line / stdlib / delete option; expand only if the user pushes back. Actively propose deletions.",
};

const CORE = `The ladder — stop at the first rung that holds: 1. Does this need to exist? (YAGNI)  2. Stdlib does it? Use it.  3. Native platform feature? Use it.  4. Already-installed dependency? Use it.  5. One line? Make it one line.  6. Only then: the minimum that works.
No unrequested abstractions, no avoidable dependency, deletion over addition, fewest files. Question complex asks ("need X, or does Y cover it?"). Mark a deliberate shortcut with an \`auto:\` comment naming the ceiling + upgrade path. NOT lazy about: input validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything explicitly requested — non-trivial logic leaves one runnable check behind.`;

/** The directive block injected into the system prompt. Pure. */
export function buildDirective(intensity: AutoIntensity): string {
  return `\n\n${AUTO_MARKER}\n${INTRO[intensity]}\n\n${CORE}\n${AUTO_END}`;
}

/** Remove any existing auto directive block + the separator it injected. Pure, idempotent. */
export function stripDirective(content: string): string {
  let start = content.indexOf(AUTO_MARKER);
  if (start === -1) return content;
  const end = content.indexOf(AUTO_END, start);
  if (end === -1) return content;
  while (start > 0 && content[start - 1] === "\n") start--; // eat the leading "\n\n" buildDirective added
  return content.slice(0, start) + content.slice(end + AUTO_END.length);
}

export const REVIEW_RUBRIC =
  "Review the current code changes for OVER-ENGINEERING ONLY — not correctness (use /review for bugs). " +
  "First get the diff: `git diff HEAD`. One line per finding: `L<line>: <tag> <what to cut> → <replacement>`. " +
  "Tags: delete (dead/speculative), stdlib (reinvented standard library), native (dep doing what the platform does), " +
  "yagni (abstraction with one caller), shrink (same logic, fewer lines). End with the net lines removable. " +
  'If nothing to cut: "Lean already. Ship."';

export const auto: SlashHandler = (arg, ctx) => {
  const action = parseAutoArg(arg);
  if (action === "review") return { resend: REVIEW_RUBRIC };
  const sys = ctx.convo.messages[0];
  if (!sys || sys.role !== "system") return { output: "  auto unavailable (no system message in conversation)" };
  const wasOn = sys.content.includes(AUTO_MARKER);
  sys.content = stripDirective(sys.content);
  if (action === "off") {
    return { output: wasOn ? "  · auto mode OFF — normal coding again" : "  · auto mode already off" };
  }
  sys.content += buildDirective(action);
  return {
    output: `  ⚙ auto ${action} mode ON — stdlib > deps, deletion > addition, the minimum that works. /auto off to stop · /auto review to audit changes.`,
  };
};
