import { z } from "zod";
import type { EvalReport } from "../eval/types.js";

export const MetaTuneOptionsSchema = z.object({
  iters: z.number().int().min(1).max(5).default(3),
  corpus: z.string().min(1).default("eval/tasks"),
  blockPath: z.string().min(1).default("PROGRAM.md"),
  adopt: z.boolean().default(false),
});
export type MetaTuneOptions = z.infer<typeof MetaTuneOptionsSchema>;

export type ProgramScore = {
  passAt1: number;
  outputTokens: number;
  cng: number;
  report: EvalReport;
};

export type ProgramVariant = {
  iter: number;
  summary: string;
  program: string;
  score: ProgramScore;
  kept: boolean;
};

export type MetaTuneRecord = {
  blockPath: string;
  baseline: ProgramScore;
  best: ProgramVariant | null;
  variants: ProgramVariant[];
  adopted: boolean;
};
