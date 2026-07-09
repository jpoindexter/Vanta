import { join } from "node:path";
import { POSTURE_ROUTINE_SPEC_FIXTURE, runSpecToAppWizard } from "../spec-to-app/wizard.js";
import type { SlashHandler } from "./types.js";

export const specToApp: SlashHandler = async (arg, ctx) => {
  const trimmed = arg.trim();
  const demo = trimmed === "--demo posture" || trimmed === "--demo";
  const spec = demo ? POSTURE_ROUTINE_SPEC_FIXTURE : trimmed;
  if (!spec) return { output: "  usage: /spec-to-app --demo posture or /spec-to-app <pasted spec>" };
  const packageRoot = process.cwd().endsWith("vanta-ts") ? process.cwd() : join(process.cwd(), "vanta-ts");
  const result = await runSpecToAppWizard({ dataDir: ctx.dataDir, packageRoot, spec });
  return {
    output: [
      result.ok ? "Spec-to-app preview: PASS" : "Spec-to-app preview: FAIL",
      `App: ${result.appDir}`,
      `Preview: ${result.previewUrl}`,
      `Summary: ${result.summaryFile}`,
      `Screenshot evidence: ${result.screenshotFile}`,
    ].join("\n"),
  };
};
