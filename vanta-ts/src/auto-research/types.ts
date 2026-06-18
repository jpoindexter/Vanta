import { z } from "zod";

export const AutoResearchOptionsSchema = z.object({
  objective: z.string().min(1),
  metric: z.string().min(1),
  bounds: z.string().min(1),
  maxIters: z.number().int().positive().default(3),
  stopAfterNoProgress: z.number().int().positive().default(1),
});
export type AutoResearchOptions = z.infer<typeof AutoResearchOptionsSchema>;

export type AutoResearchIteration = {
  iter: number;
  baseline: number;
  candidate: number;
  delta: number;
  kept: boolean;
  branch: string;
  commit?: string;
  note: string;
};

export type AutoResearchReport = {
  objective: string;
  metric: string;
  bounds: string;
  baseline: number;
  final: number;
  iterations: AutoResearchIteration[];
  stoppedReason: "max-iters" | "no-progress";
};
