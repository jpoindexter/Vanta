import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { collectSrcFiles } from "./collect.js";
import { findViolations, formatReports } from "./boundaries.js";

// Standalone entry for the architectural fitness check (CI / pre-commit).
// Mirrors src/architecture.test.ts; exits non-zero on a new boundary violation.

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const reports = findViolations(collectSrcFiles(srcRoot));

for (const r of reports.filter((x) => x.staleGrandfather.length)) {
  console.error(`note: stale grandfather entries in ${r.rule}: ${r.staleGrandfather.join(", ")}`);
}
const failed = reports.filter((r) => r.newViolations.length);
if (failed.length) {
  console.error("Architectural boundary violations:\n" + failed.map((r) => formatReports([r])).join("\n"));
  process.exit(1);
}
console.log(`✓ all ${reports.length} architectural boundaries hold`);
