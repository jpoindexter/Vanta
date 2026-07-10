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
  /** Named lifecycle seams this brain understands. Taxonomy only; not a hook bus. */
  lifecycleHooks: readonly MemoryLifecycleHookSpec[];
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

export type MemoryLifecycleHookName =
  | "prefetch"
  | "queue_prefetch"
  | "sync_turn"
  | "on_session_end"
  | "on_session_switch"
  | "on_pre_compress"
  | "on_delegation";

export type MemoryLifecycleHookSpec = {
  name: MemoryLifecycleHookName;
  phase: "before" | "during" | "after";
  purpose: string;
};

export const MEMORY_LIFECYCLE_HOOKS: readonly MemoryLifecycleHookSpec[] = [
  { name: "prefetch", phase: "before", purpose: "load relevant memory before composing a turn" },
  { name: "queue_prefetch", phase: "before", purpose: "schedule memory fetches that should not block the current turn" },
  { name: "sync_turn", phase: "after", purpose: "persist durable memory extracted from a completed turn" },
  { name: "on_session_end", phase: "after", purpose: "flush or consolidate memory when a session closes" },
  { name: "on_session_switch", phase: "during", purpose: "refresh memory context when the active session changes" },
  { name: "on_pre_compress", phase: "before", purpose: "preserve important memory before context compression drops detail" },
  { name: "on_delegation", phase: "during", purpose: "attach memory context when work is delegated to another agent" },
] as const;

const MEMORY_LIFECYCLE_HOOK_NAMES = new Set<string>(MEMORY_LIFECYCLE_HOOKS.map((hook) => hook.name));

export function isMemoryLifecycleHookName(name: string): name is MemoryLifecycleHookName {
  return MEMORY_LIFECYCLE_HOOK_NAMES.has(name);
}

// The default adapter: the live md-region + structured-entries brain (brain.ts).
const liveBrain: Brain = {
  id: "live",
  lifecycleHooks: MEMORY_LIFECYCLE_HOOKS,
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
