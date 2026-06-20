import { estTokens } from "../compress/types.js";

// VANTA-HISTORY-PASTE-STORE — large-paste offload for conversation history.
//
// When a user message carries a very large pasted block, keeping the whole thing
// in the in-context history re-bills it on every subsequent turn. This module
// detects such a paste, offloads the original to an external CCR-style store, and
// replaces it in history with a compact reference (id + size + a short head). The
// original stays retrievable by id. The analogue of tool-output CCR offload
// (`compress/store.ts`), but for USER pastes — so it REUSES the same flat-file
// store rather than introducing a second one.
//
// All functions are pure / injectable: `offloadLargePaste` and `retrievePaste`
// take an injected store, never touch disk directly, and never throw — a store
// failure leaves the text inline (errors-as-values).

/** Default paste threshold in characters; overridable per-call or via env. */
export const DEFAULT_PASTE_THRESHOLD = 8_000;

const HEAD_CHARS = 200;

/**
 * Injectable CCR-style store port. Mirrors `compress/store.ts`'s stash/retrieve
 * shape so the real `.vanta/ccr/` store (or a fake) can be passed in. `stash`
 * persists the original under the given id; `retrieve` reads it back or null.
 */
export type PasteStore = {
  stash: (id: string, text: string) => Promise<void>;
  retrieve: (id: string) => Promise<string | null>;
};

/** Deps for {@link offloadLargePaste}: the injected store + the precomputed id. */
export type OffloadDeps = {
  store: PasteStore;
  id: string;
  thresholdChars?: number;
};

/** Deps for {@link retrievePaste}: just the injected store. */
export type RetrieveDeps = {
  store: PasteStore;
};

/** Outcome of an offload attempt. When offloaded, `reference`/`id` are set. */
export type OffloadResult =
  | { offloaded: false; text: string }
  | { offloaded: true; reference: string; id: string };

/** Resolve the active threshold: explicit override > env > default. Pure. */
export function resolvePasteThreshold(
  thresholdChars?: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (typeof thresholdChars === "number" && thresholdChars > 0) return thresholdChars;
  const raw = env.VANTA_PASTE_THRESHOLD;
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_PASTE_THRESHOLD;
}

/** True when `text` is large enough to offload. Pure. */
export function isLargePaste(
  text: string,
  thresholdChars?: number,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return text.length >= resolvePasteThreshold(thresholdChars, env);
}

/**
 * The compact in-context replacement for an offloaded paste. Pure — same input
 * always yields the same reference. Carries the id, exact char count, an
 * estimated token count, and a short head preview so the model retains gist
 * without the full payload.
 */
export function buildPasteReference(id: string, text: string): string {
  const chars = text.length;
  const tokens = estTokens(text);
  const head = text.slice(0, HEAD_CHARS).replace(/\s+/g, " ").trim();
  const ellipsis = chars > HEAD_CHARS ? "…" : "";
  return (
    `[large paste offloaded — id ${id}, ${chars} chars, ~${tokens} tokens; ` +
    `head: ${head}${ellipsis} retrieve with the paste id]`
  );
}

/**
 * Offload `text` to the injected store when it exceeds the threshold, returning a
 * compact reference to use in history. A normal-sized message is returned
 * unchanged (`offloaded:false`, byte-identical text). Best-effort: a store
 * failure leaves the text inline rather than throwing.
 */
export async function offloadLargePaste(
  text: string,
  deps: OffloadDeps,
  env: NodeJS.ProcessEnv = process.env,
): Promise<OffloadResult> {
  if (!isLargePaste(text, deps.thresholdChars, env)) {
    return { offloaded: false, text };
  }
  try {
    await deps.store.stash(deps.id, text);
    return { offloaded: true, reference: buildPasteReference(deps.id, text), id: deps.id };
  } catch {
    // Store failure is non-fatal: keep the original inline so nothing is lost.
    return { offloaded: false, text };
  }
}

/**
 * Retrieve a previously offloaded paste by id, or null if unknown. Best-effort:
 * a store failure returns null rather than throwing.
 */
export async function retrievePaste(id: string, deps: RetrieveDeps): Promise<string | null> {
  try {
    return await deps.store.retrieve(id);
  } catch {
    return null;
  }
}
