import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export type MetricResult = { score: number; output: string };

export function parseMetricOutput(output: string): number {
  const matches = [...output.matchAll(/-?\d+(?:\.\d+)?/g)];
  const last = matches.at(-1)?.[0];
  if (!last) throw new Error("metric command did not print a numeric score");
  return Number(last);
}

export async function runMetric(command: string, cwd: string): Promise<MetricResult> {
  const { stdout, stderr } = await run("sh", ["-lc", command], { cwd });
  const output = `${stdout}${stderr}`.trim();
  return { score: parseMetricOutput(output), output };
}
