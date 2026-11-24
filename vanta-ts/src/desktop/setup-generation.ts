import type { DesktopState } from "./handler-state.js";

// A provider setup changes what every open chat should talk to, but each chat keeps its own provider
// instance (and the old key inside it). `generation` counts setups; a chat that has not seen the latest one
// drops its provider-bound state before its next turn, so a key replaced from one chat takes effect in all.
let generation = 0;

type Entry = { role: string; desktopRun?: { failureKind?: string } };

/** The stopped request is replayed by the caller's retry, so it must not also sit in the history it resumes from. */
function withoutStoppedRequests<T extends Entry>(messages: T[]): T[] {
  const kept = [...messages];
  for (;;) {
    const last = kept.at(-1);
    if (last?.role !== "assistant" || last.desktopRun?.failureKind !== "provider_auth" || kept.at(-2)?.role !== "user") return kept;
    kept.splice(-2, 2);
  }
}

/** Forget the provider, its conversation object and any auth-required flag; keep the chat's history for the next one. */
export function dropProviderState(state: DesktopState): void {
  if (state.convo) state._resumeHistory = withoutStoppedRequests(state.convo.messages as Entry[]) as never;
  state.setup = undefined;
  state.convo = undefined;
  state._setupError = undefined;
  state._providerAuthRequired = undefined;
  state.providerId = undefined;
  state.modelId = undefined;
}

/** A provider setup was saved: this state is current, every other state is now behind. */
export function markSetupApplied(state: DesktopState): void {
  generation += 1;
  if (state._chatActive) return; // a running turn keeps its provider; the next call catches up
  dropProviderState(state);
  state._setupGeneration = generation;
}

/** Call before a turn or a status read: bring a chat that missed a setup up to date, unless a turn is running in it. */
export function adoptSetupGeneration(state: DesktopState): void {
  if (state._setupGeneration === generation) return;
  if (state._setupGeneration === undefined) {
    state._setupGeneration = generation;
    return;
  }
  if (state._chatActive) return;
  state._setupGeneration = generation;
  dropProviderState(state);
}
