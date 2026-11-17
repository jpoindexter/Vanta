export type ReplayInputState = {
  path: string;
  expectedSha256?: string;
  actualSha256?: string;
  state: "ready" | "changed" | "missing" | "redacted";
};

export type ReplayPreview = {
  runId: string;
  canExecute: boolean;
  project: { recorded: string; current: string; changed: boolean };
  provider: { recorded?: string; current?: string; changed: boolean };
  model: { recorded?: string; current?: string; changed: boolean };
  tools: { recorded: string[]; unavailable: string[] };
  inputs: ReplayInputState[];
  warning: string;
};

export type RunLibraryMetric =
  | "run_captured"
  | "run_saved"
  | "run_unsaved"
  | "run_fork_prepared"
  | "run_replay_blocked"
  | "run_replay_prepared"
  | "run_reuse_submitted"
  | "run_reuse_completed"
  | "run_deleted";
