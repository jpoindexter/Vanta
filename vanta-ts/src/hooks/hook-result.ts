import type { ShellHookResult } from "./shell-hook-run.js";

export function hookTextResult(text: string): ShellHookResult {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed) as { block?: unknown; allow?: unknown; decision?: unknown; verdict?: unknown; reason?: unknown };
    const decision = String(parsed.decision ?? parsed.verdict ?? "").toLowerCase();
    const blocked = parsed.block === true || parsed.allow === false || decision === "block" || decision === "deny";
    if (blocked) return { code: 1, stdout: trimmed, stderr: typeof parsed.reason === "string" ? parsed.reason : "hook blocked" };
  } catch {
    // Non-JSON text is informational unless its runner fails.
  }
  return { code: 0, stdout: text, stderr: "" };
}
