// Pure heap-usage monitor: classifies the process heap into ok/high/critical
// and emits a single one-line warning at most once per cooldown. No host wiring
// this round — the intended periodic surface is the post-turn gate orchestrator
// (src/repl/post-turn-gates.ts), which already threads a shared state object and
// runs once per interactive turn; checkMemory() slots in there with its
// lastWarnedAt persisted on that GateState. All thresholds are injectable and
// env-overridable so the classifier stays pure + unit-testable.

const BYTES_PER_MB = 1024 * 1024;
const DEFAULT_HIGH_MB = 1536; // 1.5 GB
const DEFAULT_CRIT_MB = 2560; // 2.5 GB
const DEFAULT_COOLDOWN_MS = 60_000; // throttle repeat warnings to once/minute

/** Heap pressure level. Below the high threshold is silent ("ok"). */
export type HeapLevel = "ok" | "high" | "critical";

/** Thresholds in bytes. `classifyHeap` resolves these from opts → env → defaults. */
export type HeapThresholds = {
  /** HIGH warning floor in bytes (default 1.5 GB). */
  readonly highBytes: number;
  /** CRITICAL warning floor in bytes (default 2.5 GB). */
  readonly critBytes: number;
};

/** Errors as values: a resolution that fails on malformed env/opts. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Env shape the resolver reads. Injected (not `process.env` directly) for testability. */
export type MemEnv = {
  readonly VANTA_MEM_HIGH_MB?: string;
  readonly VANTA_MEM_CRIT_MB?: string;
};

function parseMb(raw: string | undefined, fallbackMb: number, name: string): Result<number> {
  if (raw === undefined || raw.trim() === "") return { ok: true, value: fallbackMb * BYTES_PER_MB };
  const mb = Number(raw);
  if (!Number.isFinite(mb) || mb <= 0) {
    return { ok: false, error: `${name} must be a positive number of MB, got "${raw}".` };
  }
  return { ok: true, value: mb * BYTES_PER_MB };
}

/** Resolve thresholds from explicit opts, else env, else defaults. Errors as values. */
export function resolveThresholds(opts?: {
  readonly highBytes?: number;
  readonly critBytes?: number;
  readonly env?: MemEnv;
}): Result<HeapThresholds> {
  const env = opts?.env ?? {};
  let highBytes = opts?.highBytes;
  if (highBytes === undefined) {
    const r = parseMb(env.VANTA_MEM_HIGH_MB, DEFAULT_HIGH_MB, "VANTA_MEM_HIGH_MB");
    if (!r.ok) return r;
    highBytes = r.value;
  }
  let critBytes = opts?.critBytes;
  if (critBytes === undefined) {
    const r = parseMb(env.VANTA_MEM_CRIT_MB, DEFAULT_CRIT_MB, "VANTA_MEM_CRIT_MB");
    if (!r.ok) return r;
    critBytes = r.value;
  }
  if (critBytes <= highBytes) {
    return { ok: false, error: `critical threshold (${critBytes}B) must exceed high threshold (${highBytes}B).` };
  }
  return { ok: true, value: { highBytes, critBytes } };
}

/**
 * Pure threshold classification. Returns "critical" at/above the critical floor,
 * "high" at/above the high floor, else "ok" (silent). Falls back to "ok" if the
 * supplied/env thresholds are malformed — classification never throws.
 */
export function classifyHeap(
  heapUsedBytes: number,
  opts?: { readonly highBytes?: number; readonly critBytes?: number; readonly env?: MemEnv },
): HeapLevel {
  const resolved = resolveThresholds(opts);
  if (!resolved.ok) return "ok";
  const { highBytes, critBytes } = resolved.value;
  if (heapUsedBytes >= critBytes) return "critical";
  if (heapUsedBytes >= highBytes) return "high";
  return "ok";
}

function formatGb(bytes: number): string {
  return (bytes / (1024 * 1024 * 1024)).toFixed(2);
}

/** Build the one-line warning string for a non-ok level. Returns "" for "ok". */
export function buildMemoryWarning(level: HeapLevel, heapUsedBytes: number): string {
  if (level === "ok") return "";
  const tag = level === "critical" ? "CRITICAL" : "HIGH";
  return `[memory] ${tag}: heap at ${formatGb(heapUsedBytes)} GB — consider /compact or a fresh session.`;
}

/** Injected dependencies for a single check. `readHeap`/`now` are pure to inject in tests. */
export type CheckMemoryDeps = {
  /** Returns current heap-used in bytes (e.g. () => process.memoryUsage().heapUsed). */
  readonly readHeap: () => number;
  /** Returns current epoch ms (e.g. () => Date.now()). */
  readonly now: () => number;
  /** Epoch ms of the last emitted warning, threaded by the host across checks. */
  readonly lastWarnedAt?: number;
  /** Cooldown window in ms; suppresses repeat warnings (default 60s). */
  readonly cooldownMs?: number;
  /** Threshold overrides + env, forwarded to classifyHeap. */
  readonly highBytes?: number;
  readonly critBytes?: number;
  readonly env?: MemEnv;
};

/** Outcome of a single check. `warnedAt` advances only when a warning is emitted. */
export type MemoryCheck = {
  readonly level: HeapLevel;
  readonly heapUsedBytes: number;
  /** The one-line warning, or "" when silent (ok level or within cooldown). */
  readonly warning: string;
  /** lastWarnedAt to thread into the next check (unchanged when no warning emits). */
  readonly warnedAt?: number;
};

/**
 * Run one heap check. Emits a warning at most once per cooldown when level != ok;
 * ok level is always silent. Pure given its injected deps — no globals touched.
 */
export function checkMemory(deps: CheckMemoryDeps): MemoryCheck {
  const heapUsedBytes = deps.readHeap();
  const level = classifyHeap(heapUsedBytes, {
    highBytes: deps.highBytes,
    critBytes: deps.critBytes,
    env: deps.env,
  });
  if (level === "ok") {
    return { level, heapUsedBytes, warning: "", warnedAt: deps.lastWarnedAt };
  }
  const cooldownMs = deps.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const now = deps.now();
  const withinCooldown = deps.lastWarnedAt !== undefined && now - deps.lastWarnedAt < cooldownMs;
  if (withinCooldown) {
    return { level, heapUsedBytes, warning: "", warnedAt: deps.lastWarnedAt };
  }
  return {
    level,
    heapUsedBytes,
    warning: buildMemoryWarning(level, heapUsedBytes),
    warnedAt: now,
  };
}
