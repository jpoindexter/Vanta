import { join } from "node:path";
import { fireHooks } from "./shell-hooks.js";
import type { HookRunDeps } from "./shell-hook-run.js";

export function stopFailureType(err: unknown): string {
  const msg = (err instanceof Error ? `${err.name} ${err.message}` : String(err)).toLowerCase();
  if (/rate.?limit|429/.test(msg)) return "rate_limit";
  if (/overload|529|capacity/.test(msg)) return "overloaded";
  if (/auth|401|403|api key|token/.test(msg)) return "authentication_failed";
  if (/billing|quota|payment|credit/.test(msg)) return "billing_error";
  if (/model.*not.*found|notareal|404/.test(msg)) return "model_not_found";
  if (/invalid.*request|400/.test(msg)) return "invalid_request";
  if (/max.*output|output.*token/.test(msg)) return "max_output_tokens";
  if (/5\d\d|server/.test(msg)) return "server_error";
  return "unknown";
}

export function errorDetails(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function fireStopFailure(
  repoRoot: string,
  context: Record<string, unknown>,
  opts: HookRunDeps & { cwd?: string } = {},
): Promise<void> {
  const error = typeof context.error === "string" ? context.error : "unknown";
  return fireHooks(join(repoRoot, ".vanta"), "StopFailure", context, { ...opts, cwd: opts.cwd ?? repoRoot, matcherValue: error });
}

export function fireCwdChanged(
  repoRoot: string,
  from: string,
  to: string,
  opts: HookRunDeps & { cwd?: string } = {},
): Promise<void> {
  return fireHooks(join(repoRoot, ".vanta"), "CwdChanged", { oldCwd: from, cwd: to }, { ...opts, cwd: to });
}
