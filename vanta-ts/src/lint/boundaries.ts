import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

/**
 * ARCH-BOUNDARY-FITNESS — the architectural fitness function. Declarative
 * dependency rules over the source import graph, each a falsifiable assertion.
 * `architecture.test.ts` runs this in `npm test`, so a new boundary violation
 * fails CI. Add a rule per ported seam (DECISIONS 2026-06-17): one entry below.
 *
 * Severity: "error" hard-fails. Pre-existing violations of a new rule go in
 * GRANDFATHER (downgraded to "warn") and the list only ever shrinks.
 */

export type BoundaryRule = {
  id: string;
  desc: string;
  severity: "error" | "warn";
  /** Which files the rule is checked against (path relative to src/, posix). */
  appliesTo: (relPath: string) => boolean;
  /** A matching line is a violation. */
  forbid: RegExp;
};

export type BoundaryViolation = {
  rule: string;
  file: string;
  line: number;
  text: string;
  severity: "error" | "warn";
  desc: string;
};

export const RULES: BoundaryRule[] = [
  {
    id: "code-intel-port",
    desc: "Consumers must depend on the code-intel PORT (code-intel/index or /interface), never the codegraph/null adapters directly.",
    severity: "error",
    appliesTo: (rel) => !rel.startsWith("code-intel/"),
    forbid: /(from\s+|import\(\s*)["'][^"']*code-intel\/(codegraph|null)(\.js)?["']/,
  },
  {
    id: "brain-port",
    desc: "Consumers must depend on the Brain PORT (brain/index or /interface), never the brain facade (brain/brain) directly.",
    severity: "error",
    appliesTo: (rel) => !rel.startsWith("brain/"),
    forbid: /(from\s+|import\(\s*)["'][^"']*brain\/brain(\.js)?["']/,
  },
  {
    id: "kernel-client-port",
    desc: "Consumers must use the KernelClient port + createKernelClient factory, never the HttpSafetyClient adapter directly.",
    severity: "error",
    appliesTo: (rel) => rel !== "safety-client.ts" && rel !== "lint/boundaries.ts",
    forbid: /\bHttpSafetyClient\b/,
  },
  {
    id: "tool-registry-port",
    desc: "Consumers must use the ToolRegistry port + createToolRegistry factory, never the MapToolRegistry adapter directly.",
    severity: "error",
    appliesTo: (rel) => rel !== "tools/registry.ts" && rel !== "lint/boundaries.ts",
    forbid: /\bMapToolRegistry\b/,
  },
  {
    id: "session-store-port",
    desc: "Consumers must use the SessionStore port (sessions/index resolveSessionStore), never sessions/store directly.",
    severity: "error",
    appliesTo: (rel) => !rel.startsWith("sessions/"),
    forbid: /(from\s+|import\(\s*)["'][^"']*sessions\/store(\.js)?["']/,
  },
];

/** Grandfathered `${ruleId}::${relPath}` keys — warn, never error. Shrink only. */
export const GRANDFATHER = new Set<string>([]);

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "node_modules" && name !== "dist") walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

export function checkBoundaries(srcDir: string = SRC): BoundaryViolation[] {
  const out: BoundaryViolation[] = [];
  for (const file of walk(srcDir)) {
    const rel = relative(srcDir, file).split("\\").join("/");
    const lines = readFileSync(file, "utf8").split("\n");
    for (const rule of RULES) {
      if (!rule.appliesTo(rel)) continue;
      lines.forEach((line, i) => {
        if (!rule.forbid.test(line)) return;
        const grandfathered = GRANDFATHER.has(`${rule.id}::${rel}`);
        out.push({
          rule: rule.id,
          file: rel,
          line: i + 1,
          text: line.trim(),
          severity: grandfathered ? "warn" : rule.severity,
          desc: rule.desc,
        });
      });
    }
  }
  return out;
}

/** Print a report and return the process exit code (0 clean, 1 on errors). */
export function runBoundaries(): number {
  const violations = checkBoundaries();
  const warns = violations.filter((v) => v.severity === "warn");
  const errors = violations.filter((v) => v.severity === "error");
  for (const v of warns) console.warn(`⚠ [${v.rule}] ${v.file}:${v.line} (grandfathered) ${v.text}`);
  for (const v of errors) console.error(`✘ [${v.rule}] ${v.file}:${v.line} ${v.text}\n   ${v.desc}`);
  if (errors.length) {
    console.error(`\n${errors.length} boundary violation(s). See DECISIONS 2026-06-17 (ports/adapters).`);
    return 1;
  }
  console.log(`✓ boundaries clean — ${RULES.length} rule(s), ${warns.length} grandfathered.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(runBoundaries());
}
