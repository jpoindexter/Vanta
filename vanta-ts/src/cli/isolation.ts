// VANTA-SAFE-MODE: troubleshooting isolation modes. Two flags, parsed in
// startup.ts into env (VANTA_SAFE_MODE / VANTA_BARE) and read back here as a
// pure predicate set the customization-loading sites consult.
//
//   --safe-mode  runs with NO user customizations at all: hooks, skills,
//                plugins, MCP, and project context (CLAUDE.md/rules) are skipped.
//   --bare       skips auto-DISCOVERY only — project context, MCP, and skills —
//                but is lighter than safe-mode: hooks and plugins still load.
//   neither      current behavior, nothing skipped (byte-identical default).
//
// The matrix is the single source of truth for what each level isolates.

const TRUTHY = new Set(["1", "true", "yes", "on"]);

function isTruthy(value: string | undefined): boolean {
  return TRUTHY.has((value ?? "").trim().toLowerCase());
}

/** The resolved isolation level for a session. Both false = default behavior. */
export type Isolation = {
  /** --safe-mode: skip ALL user customizations. */
  safeMode: boolean;
  /** --bare: skip auto-discovery (project context + MCP + skills). */
  bare: boolean;
};

/** A human-readable label for the active isolation level (banner + reasoning). */
export type IsolationLevel = "safe-mode" | "bare" | "normal";

/** Read VANTA_SAFE_MODE / VANTA_BARE from env into a pure Isolation. */
export function resolveIsolation(env: NodeJS.ProcessEnv): Isolation {
  return {
    safeMode: isTruthy(env.VANTA_SAFE_MODE),
    bare: isTruthy(env.VANTA_BARE),
  };
}

/** The active level — safe-mode dominates bare, which dominates normal. */
export function isolationLevel(iso: Isolation): IsolationLevel {
  if (iso.safeMode) return "safe-mode";
  if (iso.bare) return "bare";
  return "normal";
}

// --- skip predicates (the matrix) ---------------------------------------
// safe-mode skips EVERYTHING; bare skips discovery only (context + MCP +
// skills) and stays lighter on hooks/plugins; neither skips nothing.

/** Skip loading runtime plugins. Only safe-mode skips plugins. */
export function skipPlugins(iso: Isolation): boolean {
  return iso.safeMode;
}

/** Skip firing lifecycle hooks. Only safe-mode skips hooks. */
export function skipHooks(iso: Isolation): boolean {
  return iso.safeMode;
}

/** Skip installing + indexing skills. Both safe-mode and bare skip skills. */
export function skipSkills(iso: Isolation): boolean {
  return iso.safeMode || iso.bare;
}

/** Skip mounting MCP servers. Both safe-mode and bare skip MCP. */
export function skipMcp(iso: Isolation): boolean {
  return iso.safeMode || iso.bare;
}

/** Skip loading project context (CLAUDE.md/rules). Both safe-mode and bare skip it. */
export function skipProjectContext(iso: Isolation): boolean {
  return iso.safeMode || iso.bare;
}

/** Skip persistent operator/session memory. Only full safe-mode does this. */
export function skipMemory(iso: Isolation): boolean {
  return iso.safeMode;
}

/** Skip user and project settings. Only full safe-mode does this. */
export function skipSettings(iso: Isolation): boolean {
  return iso.safeMode;
}

/** The one-line banner confirming the active isolation level (empty for normal). */
export function isolationBanner(level: IsolationLevel): string {
  if (level === "safe-mode")
    return "⚠ safe-mode: running without ANY user customizations (hooks, skills, plugins, MCP, project context all skipped).";
  if (level === "bare")
    return "⚠ bare: auto-discovery skipped (project context, MCP, and skills) — hooks and plugins still load.";
  return "";
}
