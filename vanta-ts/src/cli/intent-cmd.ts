import {
  checkIntentDrift,
  extractIntentSpecFile,
  formatIntentSpec,
  writeIntentSpec,
} from "../intent/spec.js";

export async function runIntentCommand(rest: string[]): Promise<number> {
  const sub = rest[0];
  if (sub === "extract") return runExtract(rest.slice(1));
  if (sub === "check") return runCheck(rest.slice(1));
  console.error("usage: vanta intent extract <target> --out <spec.json> | intent check <target> <spec.json>");
  return 1;
}

async function runExtract(rest: string[]): Promise<number> {
  const target = rest[0];
  const outIdx = rest.indexOf("--out");
  const out = outIdx === -1 ? null : rest[outIdx + 1];
  if (!target || !out) {
    console.error("usage: vanta intent extract <target> --out <spec.json>");
    return 1;
  }
  const spec = await extractIntentSpecFile(target);
  await writeIntentSpec(out, spec);
  console.log(formatIntentSpec(spec));
  console.log(`Spec: ${out}`);
  return 0;
}

async function runCheck(rest: string[]): Promise<number> {
  const [target, specPath] = rest;
  if (!target || !specPath) {
    console.error("usage: vanta intent check <target> <spec.json>");
    return 1;
  }
  const result = await checkIntentDrift(target, specPath);
  console.log(result.ok ? "intent drift: none" : `intent drift: ${result.drift.length} issue(s)`);
  for (const d of result.drift) console.log(`- ${d}`);
  return result.ok ? 0 : 2;
}
