import type { LLMProvider } from "../providers/interface.js";
import type { ShellHook } from "./shell-hooks.js";
import { hookTextResult } from "./hook-result.js";
import type { ShellHookResult } from "./shell-hook-run.js";

export async function runPromptHook(
  hook: ShellHook,
  contextJson: string,
  opts: { provider?: LLMProvider } = {},
): Promise<ShellHookResult> {
  if (!hook.prompt) return { code: 1, stdout: "", stderr: "prompt hook requires prompt" };
  if (!opts.provider) return { code: 1, stdout: "", stderr: "prompt hook requires provider" };
  try {
    const result = await opts.provider.complete([
      { role: "system", content: hook.prompt },
      { role: "user", content: contextJson },
    ], []);
    return hookTextResult(result.text);
  } catch (err) {
    return { code: 1, stdout: "", stderr: err instanceof Error ? err.message : String(err) };
  }
}
