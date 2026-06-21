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

// Node's built-in modules — never an external library to fetch docs for.
// Kept as a Set for O(1) membership; covers the `node:` prefix form too.
const NODE_BUILTINS = new Set<string>([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
  "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
  "events", "fs", "http", "http2", "https", "inspector", "module", "net",
  "os", "path", "perf_hooks", "process", "punycode", "querystring", "readline",
  "repl", "stream", "string_decoder", "sys", "timers", "tls", "trace_events",
  "tty", "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib",
]);

// A valid npm package name: optional `@scope/`, then unscoped name chars.
// This is also the SECURITY charset — only names matching this reach a URL, so
// an injected library token can't smuggle arbitrary URL/path characters.
const SAFE_PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

// import/require/from specifiers we extract the package from. Captures the raw
// specifier; `packageFromSpecifier` then strips relative paths + subpaths.
const IMPORT_FROM = /\bfrom\s+["']([^"']+)["']/g; // import x from "lib"
const REQUIRE = /\brequire\(\s*["']([^"']+)["']\s*\)/g; // require("lib")
const BARE_IMPORT = /\bimport\s+["']([^"']+)["']/g; // import "lib" (side-effect)
const PY_FROM = /\bfrom\s+([a-zA-Z_][\w.]*)\s+import\b/g; // from lib import x

/**
 * Reduce an import specifier to its package name, or null if it's not an
 * external package (relative path, node builtin, absolute path).
 * `lodash/fp` → `lodash`; `@scope/pkg/sub` → `@scope/pkg`; `./x` → null. Pure.
 */
function packageFromSpecifier(spec: string): string | null {
  const s = spec.trim();
  if (s === "") return null;
  if (s.startsWith(".") || s.startsWith("/")) return null; // relative / absolute path
  const bare = s.startsWith("node:") ? s.slice(5) : s;
  const root = bare.startsWith("@")
    ? bare.split("/").slice(0, 2).join("/") // keep `@scope/pkg`
    : bare.split("/")[0]!; // strip subpath
  const baseName = root.startsWith("@") ? root.split("/")[1]! : root;
  if (NODE_BUILTINS.has(baseName) || NODE_BUILTINS.has(root)) return null;
  if (!SAFE_PACKAGE.test(root)) return null;
  return root;
}

function collectImports(text: string): string[] {
  const found: string[] = [];
  for (const re of [IMPORT_FROM, REQUIRE, BARE_IMPORT]) {
    for (const m of text.matchAll(re)) {
      const pkg = packageFromSpecifier(m[1]!);
      if (pkg) found.push(pkg);
    }
  }
  for (const m of text.matchAll(PY_FROM)) {
    const pkg = packageFromSpecifier(m[1]!.split(".")[0]!);
    if (pkg) found.push(pkg);
  }
  return found;
}

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
