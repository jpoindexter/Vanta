import { z } from "zod";

// WorkerRuntime: the one interface a company worker runtime implements. The
// Vanta native loop and external agent CLIs (Claude Code, Codex, Hermes, any
// custom CLI) all sit behind it, so a ticket can be handed to any of them.
// Data shapes are Zod-validated at the boundary; the registry parses every
// RunOutput so a misbehaving runtime cannot hand the engine garbage.

export const RuntimeIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, "runtime id must be lowercase letters, digits and dashes, starting with a letter");

/** Reported figures only. Absent or null means "not reported", never zero. */
export const UsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().nullable().optional(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const SessionRefSchema = z.object({
  runtimeId: RuntimeIdSchema,
  sessionId: z.string().min(1).max(200),
  cwd: z.string().min(1),
});
export type SessionRef = z.infer<typeof SessionRefSchema>;

export const AUTH_STATES = ["authenticated", "unauthenticated", "unknown", "not-applicable"] as const;

export const DetectResultSchema = z.object({
  runtimeId: RuntimeIdSchema,
  installed: z.boolean(),
  command: z.string().nullable(),
  version: z.string().nullable(),
  /** From the CLI's own status command exit code only. No credential file is read. */
  auth: z.enum(AUTH_STATES),
  /** True when the CLI approves its own actions (no per-action prompt can reach the owner). */
  selfApproving: z.boolean(),
  reason: z.string().optional(),
});
export type DetectResult = z.infer<typeof DetectResultSchema>;

export const RunTicketSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  workerId: z.string().min(1),
  role: z.string().min(1),
  runId: z.string().min(1),
  /** Hire-time adapter ("openai", "cli:codex"). Informational for external runtimes. */
  adapter: z.string().optional(),
  model: z.string().optional(),
  expectedOutput: z.string().optional(),
});
export type RunTicket = z.infer<typeof RunTicketSchema>;

export const RunEventSchema = z.object({
  kind: z.enum(["status", "tool", "message", "usage", "session"]),
  text: z.string().max(500),
});
export type RunEvent = z.infer<typeof RunEventSchema>;

export const WORK_PRODUCT_SOURCES = ["final-message", "git-diff"] as const;

export const RunWorkProductSchema = z.object({
  kind: z.enum(["report", "code"]),
  source: z.enum(WORK_PRODUCT_SOURCES),
  /** Artifact text: the final message, or a diff stat. */
  content: z.string().min(1),
  files: z.array(z.string()).default([]),
});
export type RunWorkProduct = z.infer<typeof RunWorkProductSchema>;

export const RUN_STATUSES = ["completed", "failed", "aborted", "refused"] as const;

export const RunOutputSchema = z.object({
  status: z.enum(RUN_STATUSES),
  summary: z.string(),
  error: z.string().optional(),
  workProducts: z.array(RunWorkProductSchema),
  usage: UsageSchema.optional(),
  sessionRef: SessionRefSchema.optional(),
  model: z.string().optional(),
});
export type RunOutput = z.infer<typeof RunOutputSchema>;

export type AccessMode = "read-only" | "edit";

export type RunInput = {
  ticket: RunTicket;
  instruction: string;
  cwd: string;
  signal: AbortSignal;
  onEvent: (event: RunEvent) => void;
  /** Defaults to "edit": the CLI may change files in cwd, never run unsandboxed or bypass its own prompts. */
  access?: AccessMode;
  /** Remaining budget for this worker. Passed to CLIs that can enforce it mid-run. */
  maxBudgetUsd?: number;
};

export type ResumeInput = RunInput & { sessionRef: SessionRef };

export type DetectContext = { env: NodeJS.ProcessEnv };

export type WorkerRuntime = {
  id: string;
  displayName: string;
  /** True when the CLI approves its own actions; the owner is warned and "Always" is withheld. */
  selfApproving: boolean;
  detect: (context: DetectContext) => Promise<DetectResult>;
  run: (input: RunInput) => Promise<RunOutput>;
  resume?: (input: ResumeInput) => Promise<RunOutput>;
};

export const failedOutput = (summary: string, status: "failed" | "aborted" | "refused" = "failed"): RunOutput =>
  ({ status, summary, error: summary, workProducts: [] });
