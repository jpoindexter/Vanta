import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");

export async function scanAccessibility(page, surface) {
  await page.evaluate(axeSource);
  const result = await page.evaluate(async (name) => {
    const axe = globalThis.axe;
    if (!axe) throw new Error("axe-core did not load in the desktop renderer");
    const report = await axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
      resultTypes: ["violations"],
    });
    return {
      surface: name,
      serious: report.violations
        .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
        .map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          helpUrl: violation.helpUrl,
          nodes: violation.nodes.map((node) => ({
            target: node.target,
            failureSummary: node.failureSummary,
          })),
        })),
    };
  }, surface);

  if (result.serious.length) {
    throw new Error(`Accessibility violations on ${surface}: ${JSON.stringify(result.serious)}`);
  }
  return { surface, seriousViolations: 0 };
}
