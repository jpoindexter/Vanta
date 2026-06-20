import type { ShellHookResult } from "./shell-hook-run.js";
import { HOOK_BLOCK_EXIT_CODE } from "./hook-exit-codes.js";

export function hookTextResult(text: string): ShellHookResult {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed) as { block?: unknown; allow?: unknown; decision?: unknown; verdict?: unknown; reason?: unknown };
    const decision = String(parsed.decision ?? parsed.verdict ?? "").toLowerCase();
    const blocked = parsed.block === true || parsed.allow === false || decision === "block" || decision === "deny";
    // A structured block verdict maps to the canonical block exit code (2) so it
    // flows through interpretHookExit as a real block (stderr → model), not a
    // non-blocking user note. See hook-exit-codes.ts.
    if (blocked) return { code: HOOK_BLOCK_EXIT_CODE, stdout: trimmed, stderr: typeof parsed.reason === "string" ? parsed.reason : "hook blocked" };
  } catch {
    // Non-JSON text is informational unless its runner fails.
  }
  return { code: 0, stdout: text, stderr: "" };
}
