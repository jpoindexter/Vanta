// WORKFLOW-LIB-CURRENT-DOCS — before Vanta writes code against an external
// library, detect which libraries a task involves and PROPOSE fetching their
// CURRENT docs. The model's training data goes stale on fast-moving libs, so the
// pre-code path grounds in current APIs instead of a hallucinated stale signature.
//
// This module is PURE: it detects the libraries a piece of text references and
// builds a docs-fetch PLAN. It does NOT fetch — the live web fetch is the injected
// boundary (`tools/web-fetch.ts`). No library referenced → empty plan → no fetch.
//
// WIRING (named, not wired this round — mirror clarity-gate's pre-turn shape):
// a pre-code workflow step (or the agent pre-turn path, alongside the clarity
// gate in `interactive-turn.ts`) would, when `libDocsEnabled(process.env)`:
//   const libs = detectLibraries(taskText);
//   const plan = buildDocsFetchPlan(libs);
//   if (plan.length) onText(formatDocsPlan(plan));   // surface the proposal
//   // then, per entry, fetch via the web_fetch tool (the kernel-gated boundary):
//   //   await webFetchTool.execute({ url: entry.docsUrl }, ctx)
// Default OFF (`VANTA_LIB_DOCS=1` to enable) so existing behavior is unchanged.

import { collectImports, SAFE_PACKAGE } from "./lib-imports.js";

/** A library reference detected in a piece of text. */
export type LibRef = {
  /** The package name (scoped packages kept whole, e.g. `@scope/pkg`). */
  name: string;
  /** Whether it came from an import/require statement or a bare mention. */
  source: "import" | "mention";
};

/** A single docs-fetch proposal: the library and the URL to fetch its docs from. */
export type DocsFetchEntry = {
  name: string;
  docsUrl: string;
};

// Known fast-moving libs → their canonical docs site. The model's training data
// is most likely stale here, so these get a real docs URL instead of the npm page.
export const DOCS_URL_PATTERNS: Readonly<Record<string, string>> = {
  react: "https://react.dev/reference/react",
  "react-dom": "https://react.dev/reference/react-dom",
  next: "https://nextjs.org/docs",
  vue: "https://vuejs.org/guide/introduction.html",
  svelte: "https://svelte.dev/docs",
  zod: "https://zod.dev",
  vitest: "https://vitest.dev/api",
  vite: "https://vitejs.dev/guide",
  ink: "https://github.com/vadimdemedes/ink#readme",
  hono: "https://hono.dev/docs",
  express: "https://expressjs.com/en/4x/api.html",
  prisma: "https://www.prisma.io/docs",
  drizzle: "https://orm.drizzle.team/docs/overview",
  "drizzle-orm": "https://orm.drizzle.team/docs/overview",
  tailwindcss: "https://tailwindcss.com/docs",
  playwright: "https://playwright.dev/docs/api/class-playwright",
  "playwright-core": "https://playwright.dev/docs/api/class-playwright",
  typescript: "https://www.typescriptlang.org/docs",
  eslint: "https://eslint.org/docs/latest",
  neverthrow: "https://github.com/supermacro/neverthrow#readme",
  pino: "https://getpino.io/#/docs/api",
} as const;

/**
 * Detect bare package mentions from a known-libs hint list — a task can name a
 * library in prose ("use zod for validation") without an import statement. Only
 * known libs (the `DOCS_URL_PATTERNS` keys) are matched, so arbitrary words don't
 * become false libraries. Pure.
 */
function collectMentions(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const lib of Object.keys(DOCS_URL_PATTERNS)) {
    const re = new RegExp(`\\b${escapeRegExp(lib)}\\b`, "i");
    if (re.test(lower)) found.push(lib);
  }
  return found;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detect the external libraries a piece of text references. Parses import /
 * require / `from … import` forms (→ `source:"import"`) and bare mentions of
 * known libs (→ `source:"mention"`); strips relative imports and node builtins;
 * keeps scoped packages whole; dedupes (an imported lib wins over a mention of
 * the same lib). No library → []. Pure, synchronous, deterministic.
 */
export function detectLibraries(text: string): LibRef[] {
  if (typeof text !== "string" || text.trim() === "") return [];
  const byName = new Map<string, LibRef>();
  for (const name of collectImports(text)) {
    byName.set(name, { name, source: "import" });
  }
  for (const name of collectMentions(text)) {
    if (!byName.has(name)) byName.set(name, { name, source: "mention" });
  }
  return [...byName.values()];
}

/**
 * Resolve the docs URL for a library: the known docs site if mapped, else the
 * npmjs.com package page. The name is URL-path-encoded (`encodeURIComponent` per
 * segment, scope slash preserved) so only a safe-charset name reaches the URL —
 * no arbitrary URL injection. Pure.
 */
export function docsUrlFor(name: string): string {
  const known = DOCS_URL_PATTERNS[name];
  if (known) return known;
  // Encode each path segment but keep npm's literal `@` scope prefix and `/`
  // separator (both safe URL sub-delims, and npm's real package URL uses them).
  const encoded = name
    .split("/")
    .map((seg) =>
      seg.startsWith("@") ? "@" + encodeURIComponent(seg.slice(1)) : encodeURIComponent(seg),
    )
    .join("/");
  return `https://www.npmjs.com/package/${encoded}`;
}

/**
 * Build the docs-fetch plan for a set of detected libraries: one entry per
 * distinct library with its docs URL. Dedupes by name (first wins). No libs → [].
 * This is the PLAN only — the live fetch is the injected web-fetch boundary. Pure.
 */
export function buildDocsFetchPlan(libs: LibRef[]): DocsFetchEntry[] {
  const seen = new Set<string>();
  const plan: DocsFetchEntry[] = [];
  for (const lib of libs) {
    if (!SAFE_PACKAGE.test(lib.name) || seen.has(lib.name)) continue;
    seen.add(lib.name);
    plan.push({ name: lib.name, docsUrl: docsUrlFor(lib.name) });
  }
  return plan;
}

/**
 * Whether the current-docs-before-use proposal is enabled. Default OFF so
 * behavior is unchanged unless `VANTA_LIB_DOCS=1` is set. Pure.
 */
export function libDocsEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.VANTA_LIB_DOCS === "1";
}

/**
 * Format the docs-fetch plan as the "before coding: fetch current docs for …"
 * proposal text the agent surfaces. Empty plan → "" (nothing to propose). Pure.
 */
export function formatDocsPlan(plan: DocsFetchEntry[]): string {
  if (plan.length === 0) return "";
  const lines = plan.map((e) => `  • ${e.name} → ${e.docsUrl}`);
  return (
    "Before coding: fetch current docs for the libraries this task uses " +
    "(training data may be stale) —\n" +
    lines.join("\n")
  );
}
