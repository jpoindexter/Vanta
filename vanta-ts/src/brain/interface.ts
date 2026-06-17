import type { BrainEntry, UpsertOpts } from "./entries.js";
import type { RecallResult, BrainHealth } from "./brain.js";

/** Options for writing a markdown region. */
export type WriteRegionOptions = { append?: boolean; env?: NodeJS.ProcessEnv };

/** Options for spreading-activation recall. */
export type RecallOptions = {
  query?: string;
  region?: string;
  topK?: number;
  reinforce?: boolean;
  env?: NodeJS.ProcessEnv;
};

/**
 * The Brain port — the full cognitive + region surface that everything outside
 * brain/ depends on. The live md-region + structured-entries brain is the
 * default adapter; an alternate brain (a future substrate, a remote store) just
 * implements this interface and registers in ./index.ts — no consumer changes.
 * Reference of Vanta's ports/adapters standard (DECISIONS 2026-06-17).
 *
 * Methods are best-effort per layer (a broken layer degrades, never throws
 * across the boundary), matching the live brain's contract.
 */
export interface Brain {
  /** Stable id: "live" | <future adapter>. */
  readonly id: string;
  readRegion(name: string, env?: NodeJS.ProcessEnv): Promise<string | null>;
  writeRegion(name: string, content: string, opts?: WriteRegionOptions): Promise<void>;
  ensureBrain(env?: NodeJS.ProcessEnv): Promise<void>;
  remember(opts: UpsertOpts): Promise<BrainEntry>;
  recall(opts?: RecallOptions): Promise<RecallResult>;
  digest(env?: NodeJS.ProcessEnv): Promise<string>;
  sweep(env?: NodeJS.ProcessEnv): Promise<number>;
  health(env?: NodeJS.ProcessEnv): Promise<BrainHealth>;
}

export type { BrainEntry, UpsertOpts } from "./entries.js";
export type { RecallResult, BrainHealth } from "./brain.js";
