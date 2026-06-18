import { z } from "zod";

// MEM-RETRIEVAL-EVAL — the measurement spine. A LongMemEval-style recall eval over
// a fixture multi-session corpus: score each retrieval mode (lexical/semantic/hybrid)
// at each distractor-noise level (s5/s10/s20/full). The grader is DETERMINISTIC —
// recall@k of the gold supporting memories — so it is trustworthy and un-gameable
// (no LLM judge). The hybrid/temporal/router cards validate their lift against this.

export const RetrievalModeSchema = z.enum(["lexical", "semantic", "hybrid"]);
export type RetrievalMode = z.infer<typeof RetrievalModeSchema>;

export const NoiseLevelSchema = z.enum(["s5", "s10", "s20", "full"]);
export type NoiseLevel = z.infer<typeof NoiseLevelSchema>;

/** The four memory-recall categories where plain retrieval behaves differently. */
export const MemCategorySchema = z.enum([
  "knowledge-update", // a fact changed across sessions — surface the LATEST
  "multi-session", // the answer aggregates several memories
  "preference", // recall a stated preference
  "temporal", // when / before / after / how-long reasoning
]);
export type MemCategory = z.infer<typeof MemCategorySchema>;

export const MemoryRecordSchema = z.object({
  id: z.string().min(1),
  /** 1-based session the memory was captured in. */
  session: z.number().int().positive(),
  /** ISO date (YYYY-MM-DD) — recency + temporal reasoning read this. */
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  text: z.string().min(1),
});
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

export const MemQuestionSchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  category: MemCategorySchema,
  /** Ids of the supporting memories that must be retrieved. */
  gold: z.array(z.string().min(1)).min(1),
});
export type MemQuestion = z.infer<typeof MemQuestionSchema>;

/** One (mode × noise) measurement: mean recall@k overall + per category. */
export type MemEvalCell = {
  mode: RetrievalMode;
  noise: NoiseLevel;
  /** False when the mode could not run (e.g. no embedder for semantic). */
  available: boolean;
  /** Mean recall@k over all questions, 0..1. */
  recallAtK: number;
  /** Mean recall@k per category, 0..1. */
  byCategory: Partial<Record<MemCategory, number>>;
};

export type MemEvalReport = {
  k: number;
  questions: number;
  corpusSizes: Partial<Record<NoiseLevel, number>>;
  cells: MemEvalCell[];
};
