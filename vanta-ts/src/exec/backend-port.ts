import type { MaybeSandboxArgs, MaybeSandboxResult } from "../sandbox/run.js";

export type ExecBackend = "docker" | "local" | "serverless";

export type ExecBackendResult =
  | { ok: true; invocation: MaybeSandboxResult }
  | { ok: false; reason: string };

/** Task-shaped boundary implemented by every execution location. */
export interface ExecBackendAdapter {
  readonly id: ExecBackend;
  wrap(args: MaybeSandboxArgs): Promise<ExecBackendResult>;
}

