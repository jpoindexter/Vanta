import { resolveBrain, type Brain, type BrainEntry, type RecallResult } from "../brain/interface.js";

// MEMORY-PROVIDER-FRAMEWORK — a pluggable memory backend behind one typed port,
// plus a small catalog the setup wizard / doctor read to know what each backend
// needs. Mirrors providers/index.ts (env-switch resolver) and
// gateway/platforms/registry.ts (catalog + availability + `implemented` honesty
// flag). The default is `local`: a thin pass-through to the existing Brain
// (brain/interface.ts), so nothing changes when no other backend is configured.
//
// Adding a backend = one MEMORY_CATALOG entry + one adapter file + one resolver
// branch — exactly like adding a messaging platform or an LLM provider. A
// catalog entry whose adapter isn't built yet stays `implemented:false`
// (preview/metadata only); the resolver refuses to select it and falls back to
// local, the same way the messaging wizard never enables a planned platform.

/** What `kind` of backend an entry describes. `local` = the built-in Brain. */
export type MemoryKind = "storage" | "service" | "local";

/** Catalog entry: the metadata the wizard/doctor need per backend. */
export type MemoryCatalogEntry = {
  /** Stable id (VANTA_MEMORY value + matches the adapter id). */
  id: string;
  label: string;
  kind: MemoryKind;
  /** True once a live adapter is wired. false = planned (preview/metadata only). */
  implemented: boolean;
  /** Env vars that must ALL be set for the backend to be usable. */
  requiredEnv: string[];
  /** Env var prompted as a hidden secret (e.g. an API key), if any. */
  secretEnv?: string;
  /** Ordered human setup steps. */
  setupSteps: string[];
  /** One-line description of what the backend does. */
  whatItDoes: string;
};

export const MEMORY_CATALOG: MemoryCatalogEntry[] = [
  {
    id: "local",
    label: "Local brain (default)",
    kind: "local",
    implemented: true,
    requiredEnv: [],
    setupSteps: [
      "Nothing to set up — the local brain lives in ~/.vanta/brain and is always on.",
    ],
    whatItDoes:
      "Markdown regions + structured entries on disk (the built-in Brain). No network, no keys; git-versioned under ~/.vanta.",
  },
  {
    id: "sqlite-vec",
    label: "SQLite vector store (local file)",
    kind: "storage",
    implemented: false,
    requiredEnv: ["VANTA_MEMORY_SQLITE_PATH"],
    setupSteps: [
      "Pick a file path for the vector database (e.g. ~/.vanta/memory.db).",
      "Set VANTA_MEMORY_SQLITE_PATH to that path.",
    ],
    whatItDoes:
      "Planned: embedding-backed recall in a single local SQLite file (sqlite-vec). Local-only, no service. Adapter not yet built.",
  },
  {
    id: "qdrant",
    label: "Qdrant (vector service)",
    kind: "service",
    implemented: false,
    requiredEnv: ["VANTA_MEMORY_QDRANT_URL", "VANTA_MEMORY_QDRANT_KEY"],
    secretEnv: "VANTA_MEMORY_QDRANT_KEY",
    setupSteps: [
      "Run or provision a Qdrant instance and create a collection.",
      "Set VANTA_MEMORY_QDRANT_URL to the server URL.",
      "Set VANTA_MEMORY_QDRANT_KEY to the API key.",
    ],
    whatItDoes:
      "Planned: semantic recall against a hosted/self-hosted Qdrant vector service for large or shared memory. Adapter not yet built.",
  },
];

/** Options forwarded to a write. `region` lets callers target a brain region. */
export type RememberOpts = { region?: string; env?: NodeJS.ProcessEnv };
/** Options forwarded to a recall. */
export type RecallOpts = { topK?: number; region?: string; env?: NodeJS.ProcessEnv };

/**
 * The memory PORT. The minimal text-first surface the rest of the app consumes,
 * so a different backend drops in as one adapter — consumers never depend on a
 * concrete store's internal types. The local adapter maps these straight onto
 * the Brain's remember/recall.
 */
export type MemoryProvider = {
  /** Adapter id (matches the catalog id, e.g. "local"). */
  id: string;
  /** Store a piece of text; re-asserting the same text strengthens it. */
  remember(text: string, opts?: RememberOpts): Promise<BrainEntry>;
  /** Retrieve memories relevant to a query. */
  recall(query: string, opts?: RecallOpts): Promise<RecallResult>;
};

const DEFAULT_REGION = "semantic";

/** Wrap the existing Brain as a MemoryProvider — a thin, read-through pass. */
export function localMemoryProvider(brain: Brain): MemoryProvider {
  return {
    id: "local",
    remember: (text, opts) =>
      brain.remember({ region: opts?.region ?? DEFAULT_REGION, content: text, env: opts?.env }),
    recall: (query, opts) =>
      brain.recall({ query, topK: opts?.topK, region: opts?.region, env: opts?.env }),
  };
}

/** Look a catalog entry up by id. Pure. */
export function memoryProviderById(id: string): MemoryCatalogEntry | undefined {
  return MEMORY_CATALOG.find((m) => m.id === id);
}

export type MemoryAvailability = {
  /** All required env vars are present (local has none, so always true). */
  configured: boolean;
  /** Which required env vars are absent. */
  missing: string[];
  /** Usable right now = implemented AND configured. */
  available: boolean;
  /** True for the built-in local backend. */
  local: boolean;
};

/**
 * Whether a backend is usable in this env. `configured` = no required env
 * missing; `available` = also implemented (a planned entry is never available).
 * Pure — mirrors platformAvailability.
 */
export function memoryProviderAvailability(
  entry: MemoryCatalogEntry,
  env: NodeJS.ProcessEnv,
): MemoryAvailability {
  const missing = entry.requiredEnv.filter((k) => !env[k] || !env[k]!.trim());
  const configured = missing.length === 0;
  return { configured, missing, available: entry.implemented && configured, local: entry.kind === "local" };
}

/**
 * Resolve the active memory provider from environment.
 *   VANTA_MEMORY unset / "local" → the Brain (default, no behavior change)
 *   VANTA_MEMORY=<id>            → that backend, but ONLY if its adapter is
 *                                  implemented AND fully configured; otherwise
 *                                  falls back to local (a planned/unconfigured
 *                                  backend never silently activates).
 */
export function resolveMemoryProvider(env: NodeJS.ProcessEnv = process.env): MemoryProvider {
  const local = localMemoryProvider(resolveBrain(env));
  const id = (env.VANTA_MEMORY ?? "local").toLowerCase();
  if (id === "local") return local;
  const entry = memoryProviderById(id);
  if (!entry || entry.kind === "local") return local;
  // No real non-local adapter is built yet, so any selected backend that passes
  // the availability gate would still have nowhere to go — fall back to local.
  // When a backend ships, add `if (id === "<id>" && avail.available) return makeX(env);` here.
  return local;
}

export type { Brain, BrainEntry, RecallResult };
