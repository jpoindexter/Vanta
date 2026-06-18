import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EvalReport } from "../eval/types.js";
import { mutateProgram } from "./mutate.js";
import { betterScore, scoreProgram } from "./score.js";
import { writeMetaTuneRecord } from "./record.js";
import type { MetaTuneOptions, MetaTuneRecord, ProgramVariant } from "./types.js";

export type MetaTuneDeps = {
  readProgram?: (path: string) => string;
  writeProgram?: (path: string, text: string) => void;
  evalProgram: (program: string) => Promise<EvalReport>;
  approve?: (summary: string) => Promise<boolean>;
  record?: (record: MetaTuneRecord) => void;
};

export async function runMetaTuneInstructions(args: {
  repoRoot: string; opts: MetaTuneOptions; deps: MetaTuneDeps;
}): Promise<MetaTuneRecord> {
  const path = join(args.repoRoot, args.opts.blockPath);
  const readProgram = args.deps.readProgram ?? ((p) => readFileSync(p, "utf8"));
  const writeProgram = args.deps.writeProgram ?? ((p, text) => writeFileSync(p, text, "utf8"));
  const base = readProgram(path);
  const baseline = scoreProgram(await args.deps.evalProgram(base));
  let bestScore = baseline;
  let best: ProgramVariant | null = null;
  const variants: ProgramVariant[] = [];

  for (let iter = 1; iter <= args.opts.iters; iter++) {
    const mutation = mutateProgram(base, iter);
    const score = scoreProgram(await args.deps.evalProgram(mutation.program));
    const kept = betterScore(score, bestScore);
    const variant = { iter, summary: mutation.summary, program: mutation.program, score, kept };
    variants.push(variant);
    if (kept) { best = variant; bestScore = score; }
  }

  let adopted = false;
  if (args.opts.adopt && best) {
    adopted = await (args.deps.approve ?? (async () => false))(best.summary);
    if (adopted) writeProgram(path, best.program);
  }
  const record = { blockPath: args.opts.blockPath, baseline, best, variants, adopted };
  (args.deps.record ?? ((r) => { writeMetaTuneRecord(args.repoRoot, r); }))(record);
  return record;
}
