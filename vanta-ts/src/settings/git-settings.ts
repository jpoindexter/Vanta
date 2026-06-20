import type { Settings } from "./store.js";

// VANTA-SETTINGS-GIT — pure resolvers for the four git-parity settings.
// Each resolver maps a (possibly unset) setting to the value its consumer reads;
// every default reproduces today's behavior so an unset setting changes nothing:
//   - attribution            → no Co-Authored-By line is appended today → default undefined
//   - includeGitInstructions → no git block in the prompt today        → default "" (omitted)
//   - prUrlTemplate          → no PR segment in the footer today        → caller omits when unset
//   - respectGitignore       → the @file picker does not filter today   → default true (resolver),
//                              consumers opt in (listRepoFiles defaults to off) so nothing changes
// Pure — no I/O. Consumers (git-write, prompt, status footer, file picker) read these.

/** The `{PR}` placeholder a PR-URL template substitutes with the PR number. */
export const PR_PLACEHOLDER = "{PR}";

/** Default git best-practice block, injected only when includeGitInstructions is on. */
const GIT_INSTRUCTIONS = [
  "Git best practice:",
  "- Branch from the default branch with a typed name (feat/fix/refactor/chore/docs/ + kebab-case); never commit directly to main/master unless told.",
  "- Commit on a completed slice with a conventional-commit subject (type(scope): summary); keep messages about why, not a file list.",
  "- Stage intentionally and review the diff before committing; never commit secrets or .env.",
  "- Push only when asked; never force-push a shared branch, and never amend or rebase already-pushed history.",
].join("\n");

/**
 * The attribution line appended to a commit message (e.g. a Co-Authored-By
 * trailer), or undefined when no override is set. Default is undefined because
 * Vanta appends no attribution today — an unset setting keeps that behavior.
 */
export function resolveAttribution(settings: Settings): string | undefined {
  const a = settings.attribution?.trim();
  return a ? a : undefined;
}

/**
 * The git best-practice block to fold into the system prompt, or "" when
 * includeGitInstructions is unset/false (the default — prompt unchanged).
 */
export function gitInstructionsBlock(settings: Settings): string {
  return settings.includeGitInstructions === true ? GIT_INSTRUCTIONS : "";
}

/**
 * Substitute every `{PR}` in a PR-URL template with the PR number. Pure string
 * substitution — the template is operator-supplied (e.g.
 * "https://github.com/o/r/pull/{PR}"). A template without `{PR}` is returned
 * unchanged; the number is coerced to a string.
 */
export function formatPrUrl(template: string, prNumber: number | string): string {
  return template.split(PR_PLACEHOLDER).join(String(prNumber));
}

/**
 * Whether a gitignore-aware consumer (the @file picker) should exclude ignored
 * paths. Defaults to true — but consumers keep their current behavior by only
 * acting on this when explicitly threaded in, so an unset setting changes nothing.
 */
export function shouldRespectGitignore(settings: Settings): boolean {
  return settings.respectGitignore ?? true;
}
