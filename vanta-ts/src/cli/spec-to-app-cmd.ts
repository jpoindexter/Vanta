import { join } from "node:path";
import { POSTURE_ROUTINE_SPEC_FIXTURE, runSpecToAppWizard } from "../spec-to-app/wizard.js";

export async function runSpecToAppCommand(repoRoot: string, rest: string[] = []): Promise<number> {
  const demo = rest[0] === "--demo" && (rest[1] === "posture" || !rest[1]);
  const openPreview = rest.includes("--open");
  const spec = demo ? POSTURE_ROUTINE_SPEC_FIXTURE : rest.filter((arg) => arg !== "--open").join(" ").trim();
  if (!spec) {
    console.error("usage: vanta spec-to-app --demo posture [--open] | <pasted spec>");
    return 1;
  }
  const result = await runSpecToAppWizard({ dataDir: join(repoRoot, ".vanta"), packageRoot: join(repoRoot, "vanta-ts"), spec, openPreview });
  console.log(formatSpecToAppResult(result));
  return result.ok ? 0 : 1;
}

function formatSpecToAppResult(result: Awaited<ReturnType<typeof runSpecToAppWizard>>): string {
  return [
    result.ok ? "Spec-to-app preview: PASS" : "Spec-to-app preview: FAIL",
    `App: ${result.appDir}`,
    `Preview: ${result.previewUrl}`,
    `Summary: ${result.summaryFile}`,
    `Screenshot evidence: ${result.screenshotFile}`,
    "",
    "Checks:",
    ...result.checks.map((c) => `  ${c.ok ? "PASS" : "FAIL"} ${c.name}`),
  ].join("\n");
}
