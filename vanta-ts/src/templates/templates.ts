// TEMPLATES — recognize a common task pattern in the user's message and prepend
// a terse, senior template-context block before it reaches the model. Message-
// level augmentation (mirrors repl/mode-detect.ts buildModeHint), NOT a system-
// prompt change. Pure + deterministic; OFF by default (VANTA_TEMPLATES=1 to arm).

/** One built-in task template: a pattern + the context to inject when it matches. */
export type Template = {
  readonly id: string;
  readonly label: string;
  readonly match: RegExp;
  /** The augmentation: a terse checklist/approach for this task type. */
  readonly context: string;
};

// Unique marker so augmentation is idempotent — never double-inject a block.
const MARKER = "[template:";

// Order matters: more specific patterns win over the generic ones. First match.
export const DEFAULT_TEMPLATES: ReadonlyArray<Template> = [
  {
    id: "fix-bug",
    label: "Fix a bug",
    match: /\b(fix|debug|resolve|squash)\b.{0,40}\b(bug|crash|error|issue|regression|failure|broken)\b|\b(bug|crash|error|regression)\b.{0,40}\b(fix|broken|failing)\b/i,
    context:
      "approach: reproduce first, write a failing test that captures the bug, then make the minimal fix, then verify the test passes and nothing else regressed.",
  },
  {
    id: "write-test",
    label: "Write a test",
    match: /\b(write|add|create)\b.{0,30}\b(test|tests|spec|specs|unit test|coverage)\b|\btest coverage\b/i,
    context:
      "approach: name tests by behavior, follow arrange-act-assert, cover the happy path plus edge/error cases, keep each test isolated, and run them to confirm green.",
  },
  {
    id: "refactor",
    label: "Refactor",
    match: /\b(refactor|clean ?up|restructure|simplify|extract|decompose|tidy)\b/i,
    context:
      "approach: keep behavior identical, lean on existing tests (add characterization tests if none), change in small reversible steps, and re-run tests after each step.",
  },
  {
    id: "add-feature",
    label: "Add a feature",
    match: /\b(add|implement|build|create)\b.{0,40}\b(feature|endpoint|command|tool|page|component|module|capability)\b/i,
    context:
      "approach: define done in one sentence, ship the smallest vertical slice end-to-end with tests in the same slice, no stubs/TODOs, then verify the slice works.",
  },
  {
    id: "review",
    label: "Review code",
    match: /\b(review|critique|audit|inspect|assess)\b.{0,30}\b(code|pr|pull request|diff|change|changes|function|module)\b|\bcode review\b/i,
    context:
      "approach: check correctness, edge cases, error handling, security, and tests; be specific with file:line evidence and actionable fixes; separate must-fix from nits.",
  },
];

/** Classify a message into a known task template id, or null. Pure, first match. */
export function classifyPrompt(
  message: string,
  catalog: ReadonlyArray<Template> = DEFAULT_TEMPLATES,
): string | null {
  for (const t of catalog) if (t.match.test(message)) return t.id;
  return null;
}

/**
 * Prepend the matched template's context as a clearly-marked block, or return
 * the message unchanged when nothing matches. Idempotent — if a template block
 * is already present, the message is returned untouched (no double-injection).
 */
export function augmentPrompt(
  message: string,
  catalog: ReadonlyArray<Template> = DEFAULT_TEMPLATES,
): string {
  if (message.includes(MARKER)) return message;
  const id = classifyPrompt(message, catalog);
  if (!id) return message;
  const tpl = catalog.find((t) => t.id === id);
  if (!tpl) return message;
  return `${MARKER}${tpl.id}] ${tpl.context}\n\n${message}`;
}

/** Resolved templates config from env. OFF by default; VANTA_TEMPLATES=1 arms it. */
export function resolveTemplatesConfig(env: NodeJS.ProcessEnv): { enabled: boolean } {
  const raw = (env.VANTA_TEMPLATES ?? "").trim().toLowerCase();
  return { enabled: raw === "1" || raw === "true" || raw === "on" };
}

/** Apply augmentation only when enabled; otherwise return the message unchanged. */
export function maybeAugmentPrompt(
  message: string,
  env: NodeJS.ProcessEnv = process.env,
  catalog: ReadonlyArray<Template> = DEFAULT_TEMPLATES,
): string {
  return resolveTemplatesConfig(env).enabled ? augmentPrompt(message, catalog) : message;
}
