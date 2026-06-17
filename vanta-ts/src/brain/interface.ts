import {
  readRegion, writeRegion, remember, recall, brainDigest, brainHealth,
  type BrainEntry, type RecallResult, type BrainHealth,
} from "./brain.js";
import type { UpsertOpts } from "./entries.js";

// The Brain PORT. Everything outside brain/ depends on this interface, never on a
// concrete brain variant — so a different brain (the dormant v2 substrate, a
// remote/encrypted store, a stub) drops in as one adapter + one registration,
// with zero consumer edits. Enforced by the `brain-variant-port` fitness rule.

export type Brain = {
  /** Adapter id (e.g. "live"). */
  id: string;
  /** Read a markdown brain region, or null when absent. */
  read(name: string, env?: NodeJS.ProcessEnv): Promise<string | null>;
  /** Write (or append to) a markdown brain region. */
  write(name: string, content: string, opts?: { append?: boolean; env?: NodeJS.ProcessEnv }): Promise<void>;
  /** Store a structured memory (re-asserting strengthens it). */
  remember(opts: UpsertOpts): Promise<BrainEntry>;
  /** Spreading-activation retrieval. */
  recall(opts?: Parameters<typeof recall>[0]): Promise<RecallResult>;
  /** The one composed prompt digest (regions + top structured memories). */
  digest(env?: NodeJS.ProcessEnv): Promise<string>;
  /** Self-check of both layers. */
  health(env?: NodeJS.ProcessEnv): Promise<BrainHealth>;
};

export type { BrainEntry, RecallResult, BrainHealth };

// The default adapter: the live md-region + structured-entries brain (brain.ts).
const liveBrain: Brain = {
  id: "live",
  read: (name, env) => readRegion(name, env),
  write: (name, content, opts) => writeRegion(name, content, opts ?? {}),
  remember,
  recall,
  digest: brainDigest,
  health: brainHealth,
};

// The one registration point. Add a brain = one entry here + one adapter file.
const ADAPTERS: Readonly<Record<string, Brain>> = { live: liveBrain };

/** Resolve the active brain adapter (VANTA_BRAIN, default "live"). */
export function resolveBrain(env: NodeJS.ProcessEnv = process.env): Brain {
  return ADAPTERS[(env.VANTA_BRAIN ?? "live").toLowerCase()] ?? liveBrain;
}
