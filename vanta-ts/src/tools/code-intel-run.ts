import { resolveCodeIntelProvider } from "../code-intel/index.js";
import type { CodeIntelProvider } from "../code-intel/index.js";
import type { ToolResult } from "./types.js";

/**
 * Shared adapter between the code-intel tools and the {@link CodeIntelProvider}
 * port. Resolves the active engine, degrades gracefully when none is available
 * (returns ok:false instead of throwing — the agent loop continues), and maps
 * engine output / errors to a {@link ToolResult}. The four code_* tools never
 * touch the engine directly; they go through here.
 */
export async function withCodeIntel(
  toolName: string,
  fn: (provider: CodeIntelProvider) => Promise<string>,
): Promise<ToolResult> {
  const provider = resolveCodeIntelProvider(process.env);
  if (!(await provider.isAvailable())) {
    return {
      ok: false,
      output: `${toolName}: code intelligence unavailable — install codegraph (\`codegraph --version\`) or set VANTA_CODE_INTEL. Continuing without it.`,
    };
  }
  try {
    const output = await fn(provider);
    return { ok: true, output: output || "(no output)" };
  } catch (err) {
    return { ok: false, output: `${toolName} failed: ${(err as Error).message}` };
  }
}
