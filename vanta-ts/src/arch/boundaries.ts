// Architectural fitness function. Each rule is a falsifiable assertion over the
// import graph; a new violation turns a test red. Skills/hooks only GUIDE the
// ports-and-adapters standard — this ENFORCES it. Adding a boundary = one entry
// in RULES (+ optionally a grandfather list while a port lands).

export type ImportRef = { spec: string; line: number };

/** A declarative boundary. `forbidden` is matched against each import specifier
 *  of a file that `applies` (and isn't `exempt`). `hard` rules cannot be
 *  grandfathered — any violation fails immediately. */
export type BoundaryRule = {
  id: string;
  desc: string;
  applies: (relPath: string) => boolean;
  exempt?: (relPath: string) => boolean;
  forbidden: (spec: string, relPath: string) => boolean;
  hard: boolean;
};

export type SrcFile = { path: string; src: string };
export type Violation = { rule: string; path: string; spec: string; line: number };
export type RuleReport = {
  rule: string;
  hard: boolean;
  newViolations: Violation[];
  grandfathered: Violation[];
  staleGrandfather: string[]; // grandfather entries that no longer violate (can be removed)
};

const IMPORT_RE = /^\s*(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]/;
const BARE_IMPORT_RE = /^\s*import\s*['"]([^'"]+)['"]/;

/** Extract every import/re-export specifier from a source file. Static ESM only
 *  (the whole codebase is static-import) — dynamic import() is intentionally
 *  ignored so lazy adapter loading inside a factory never trips a rule. */
export function parseImports(src: string): ImportRef[] {
  const out: ImportRef[] = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = IMPORT_RE.exec(line) ?? BARE_IMPORT_RE.exec(line);
    if (m) out.push({ spec: m[1]!, line: i + 1 });
  }
  return out;
}

const norm = (p: string): string => p.replace(/\\/g, "/");
const under = (...dirs: string[]) => (p: string): boolean => dirs.some((d) => norm(p).includes(`/${d}/`) || norm(p).startsWith(`${d}/`));
const isTest = (p: string): boolean => /\.test\.[tj]sx?$/.test(p);

const CONCRETE_PROVIDERS = ["openai", "anthropic", "codex", "gemini", "ollama", "openrouter", "claude-code"];

// The rule table. Each entry is one boundary. Order is cosmetic.
export const RULES: readonly BoundaryRule[] = [
  {
    id: "code-intel-seam",
    desc: "Only the code-intel adapter may import the codegraph engine; core/factory/tools depend on the CodeIntelProvider port.",
    applies: (p) => !isTest(p),
    exempt: under("code-intel"),
    forbidden: (spec) => /(^|\/)codegraph(\/|$|\.)/i.test(spec),
    hard: true,
  },
  {
    id: "no-concrete-provider-in-factory",
    desc: "The factory pipeline must not import a concrete LLM provider — it depends on the resolved LLMProvider port.",
    applies: under("factory"),
    forbidden: (spec) => CONCRETE_PROVIDERS.some((n) => new RegExp(`providers/${n}(\\.js)?$`).test(spec)),
    hard: true,
  },
];

// Files permitted to cross a (non-hard) boundary today. SHRINK-ONLY: never add a
// new path here for new code — fix the import instead. Entries are removed as
// ports land. Keyed by rule id.
export const GRANDFATHER: Readonly<Record<string, readonly string[]>> = {};

function grandfatheredFor(ruleId: string): Set<string> {
  return new Set((GRANDFATHER[ruleId] ?? []).map(norm));
}

/** Evaluate one rule over the source set. */
export function evaluateRule(rule: BoundaryRule, files: SrcFile[]): RuleReport {
  const allowed = grandfatheredFor(rule.id);
  const seen = new Set<string>();
  const newViolations: Violation[] = [];
  const grandfathered: Violation[] = [];
  for (const f of files) {
    const rel = norm(f.path);
    if (!rule.applies(rel) || rule.exempt?.(rel)) continue;
    for (const imp of parseImports(f.src)) {
      if (!rule.forbidden(imp.spec, rel)) continue;
      const v: Violation = { rule: rule.id, path: rel, spec: imp.spec, line: imp.line };
      if (!rule.hard && allowed.has(rel)) { grandfathered.push(v); seen.add(rel); }
      else newViolations.push(v);
    }
  }
  const staleGrandfather = [...allowed].filter((p) => !seen.has(p));
  return { rule: rule.id, hard: rule.hard, newViolations, grandfathered, staleGrandfather };
}

/** Evaluate every rule. */
export function findViolations(files: SrcFile[]): RuleReport[] {
  return RULES.map((r) => evaluateRule(r, files));
}

/** Human-readable report for the CLI / test failure message. */
export function formatReports(reports: RuleReport[]): string {
  const lines: string[] = [];
  for (const r of reports) {
    for (const v of r.newViolations) {
      lines.push(`  ✗ [${r.rule}] ${v.path}:${v.line} imports "${v.spec}"${r.hard ? " (HARD boundary)" : ""}`);
    }
  }
  return lines.join("\n");
}
