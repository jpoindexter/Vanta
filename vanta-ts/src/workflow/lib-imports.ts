// WORKFLOW-LIB-CURRENT-DOCS (parse half) — extract the external package name(s)
// a piece of source text imports. Pure, synchronous, deterministic; no network.
// `lib-docs.ts` composes these with the known-lib mention pass + docs-URL plan.

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
export const SAFE_PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

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

export function collectImports(text: string): string[] {
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
