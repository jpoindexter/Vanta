import { z } from "zod";

import { ERROR_CODE_KEYS } from "./error-surface";

const KEY = "desktop:support-failures:v1";
const MAX_FAILURES = 20;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const codes = new Set<string>([
  ...ERROR_CODE_KEYS,
  "api_key_missing",
  "api_key_rejected",
  "gateway_auth_failed",
  "method_not_allowed",
  "microphone_permission",
  "pool_slot_timeout",
  "restart_required",
  "rpc_out_of_sync",
  "storage_failure",
  "attachment_failed",
  "attachment_path_unavailable",
  "other",
  "unclassified",
]);
const failureSchema = z.object({
  id: z.uuid(),
  at: z.iso.datetime(),
  area: z.enum(["desktop", "chat", "attachment"]),
  code: z.string().refine((code) => codes.has(code)),
});
type SupportFailure = z.infer<typeof failureSchema>;
let memory: SupportFailure[] = [];
let memoryOnly = false;

/** Closed metadata only: never pass exception text, paths, filenames, prompts or logs. */
export function recentSupportFailures(): SupportFailure[] {
  let records = memory;
  try {
    const stored = memoryOnly ? null : localStorage.getItem(KEY);
    if (stored)
      records = z
        .array(failureSchema)
        .max(MAX_FAILURES)
        .parse(JSON.parse(stored));
  } catch {
    // A storage refusal or corrupt older value must not hide this run's in-memory evidence.
  }
  const now = Date.now();
  return records.filter(
    (record) =>
      Date.parse(record.at) >= now - RETENTION_MS &&
      Date.parse(record.at) <= now,
  );
}

export function recordSupportFailure(
  area: SupportFailure["area"],
  code: unknown,
): void {
  try {
    const failure = failureSchema.parse({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      area,
      code: typeof code === "string" && codes.has(code) ? code : "unclassified",
    });
    memory = [...recentSupportFailures(), failure].slice(-MAX_FAILURES);
    memoryOnly = true;
    localStorage.setItem(KEY, JSON.stringify(memory));
    memoryOnly = false;
  } catch {
    // Diagnostics never interrupt the action's original recovery.
  }
}

export function clearSupportFailures(): void {
  localStorage.removeItem(KEY);
  memory = [];
  memoryOnly = false;
}
