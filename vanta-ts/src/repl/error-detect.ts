export const DEFAULT_ERRORDETECT_THRESHOLD = 3;

const ERROR_PATTERNS = /\b(error|failed|failure|not found|ENOENT|exit code|exception|cannot|unable)\b/i;

/** True when a tool result signals a failure — either ok:false or error keywords in output. */
export function isErrorResult(ok: boolean, output: string): boolean {
  if (!ok) return true;
  return ERROR_PATTERNS.test(output);
}

export function buildErrorDetectText(consecutiveFailures: number): string {
  return (
    `⚠ ${consecutiveFailures} consecutive tool failures. Pausing — want me to reassess the approach before continuing?`
  );
}
