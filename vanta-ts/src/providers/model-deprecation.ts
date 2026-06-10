// CC-MODEL-DEPRECATION — surface a retirement notice when the active model id is a
// known-legacy model. Pure: no I/O, no Date.now(); `now` is injected for testability.
// The retirement dates are best-effort/illustrative static strings for clearly-superseded
// models — not a live registry.

type Deprecation = { retires: string; replacement?: string };

const SONNET = "claude-sonnet-4-6";

/** Curated map of clearly-legacy model ids → retirement info. Keys are lowercase. */
const DEPRECATIONS: Record<string, Deprecation> = {
  "claude-1": { retires: "2024-11-06", replacement: SONNET },
  "claude-2": { retires: "2025-07-21", replacement: SONNET },
  "claude-2.0": { retires: "2025-07-21", replacement: SONNET },
  "claude-2.1": { retires: "2025-07-21", replacement: SONNET },
  "claude-instant-1": { retires: "2025-07-21", replacement: SONNET },
  "gpt-4-0314": { retires: "2024-06-13", replacement: "gpt-4o" },
  "gpt-4-0613": { retires: "2025-06-06", replacement: "gpt-4o" },
  "gpt-3.5-turbo-0301": { retires: "2024-09-13", replacement: "gpt-4o-mini" },
  "gpt-3.5-turbo-0613": { retires: "2024-09-13", replacement: "gpt-4o-mini" },
  "gemini-1.0-pro": { retires: "2025-02-15", replacement: "gemini-2.5-flash" },
  "gemini-pro": { retires: "2025-02-15", replacement: "gemini-2.5-flash" },
};

/** Find the deprecation whose key equals or is a prefix of the (lowercased) model id. */
function matchDeprecation(modelId: string): Deprecation | null {
  const id = modelId.trim().toLowerCase();
  if (!id) return null;
  const exact = DEPRECATIONS[id];
  if (exact) return exact;
  for (const [key, dep] of Object.entries(DEPRECATIONS)) {
    if (id.startsWith(key)) return dep;
  }
  return null;
}

/**
 * Notice for a single model id, or null if it isn't a known-deprecated model.
 * Matches case-insensitively and on a deprecated-key PREFIX
 * (so `gpt-4-0314-preview` matches `gpt-4-0314`). `now` is reserved for
 * future "retired N days ago" framing; it does not gate the result.
 */
export function modelDeprecationNotice(modelId: string, _now: Date): string | null {
  const dep = matchDeprecation(modelId);
  if (!dep) return null;
  const suffix = dep.replacement ? ` — switch to ${dep.replacement}` : "";
  return `model '${modelId}' is deprecated (retires ${dep.retires})${suffix}`;
}

/** Notices for the active model (`env.VANTA_MODEL`); `[]` when unset or current. */
export function modelDeprecationNotices(env: NodeJS.ProcessEnv, now: Date): string[] {
  const modelId = env.VANTA_MODEL;
  if (!modelId) return [];
  const notice = modelDeprecationNotice(modelId, now);
  return notice ? [notice] : [];
}
