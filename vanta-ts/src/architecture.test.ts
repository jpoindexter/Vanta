import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { collectSrcFiles } from "./arch/collect.js";
import { findViolations, formatReports, RULES, parseImports } from "./arch/boundaries.js";

// The architectural fitness function. This runs as part of `npm test`, so a new
// import that crosses a declared boundary turns the suite red — the enforcement
// the ports-and-adapters standard needs (skills only guide; this fails CI).

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)));

describe("architecture boundaries", () => {
  const files = collectSrcFiles(SRC_ROOT);
  const reports = findViolations(files);

  it("scans the real source tree", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  for (const rule of RULES) {
    const report = reports.find((r) => r.rule === rule.id)!;
    it(`upholds boundary: ${rule.id}`, () => {
      if (report.newViolations.length) {
        throw new Error(`Boundary "${rule.id}" crossed:\n${formatReports([report])}\n\n${rule.desc}`);
      }
      expect(report.newViolations).toHaveLength(0);
    });
  }

  it("parses static import specifiers", () => {
    const refs = parseImports(`import { a } from "./a.js";\nexport { b } from "../b.js";\nimport "./side.js";`);
    expect(refs.map((r) => r.spec)).toEqual(["./a.js", "../b.js", "./side.js"]);
  });
});
