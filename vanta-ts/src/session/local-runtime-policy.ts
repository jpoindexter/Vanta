import type { CompletionConfig, LLMProvider, ProviderRoute } from "../providers/interface.js";
import { splitStableVolatile } from "../prompt.js";

export const LOCAL_CODING_TOOLS = [
  "read_file",
  "edit_file",
  "write_file",
  "grep_files",
  "glob_files",
  "shell_cmd",
] as const;

/** Keep small local models focused unless the project or operator chose a scope. */
export function resolveSessionToolInclude(
  allowedTools: string[] | undefined,
  route: ProviderRoute | undefined,
  env: NodeJS.ProcessEnv,
): string[] | undefined {
  if (allowedTools !== undefined) return allowedTools;
  if (route?.billingMode !== "local" || env.VANTA_LOCAL_FULL_TOOLS === "1") return undefined;
  return [...LOCAL_CODING_TOOLS];
}

/**
 * Local models get the same kernel/scope contract without the full project,
 * memory, and skill digests. They can load repository instructions on demand,
 * which keeps first-token latency bounded on consumer hardware.
 */
export function resolveSessionSystemPrompt(
  fullPrompt: string,
  repoRoot: string,
  route: ProviderRoute | undefined,
  env: NodeJS.ProcessEnv,
): string {
  if (route?.billingMode !== "local" || env.VANTA_LOCAL_FULL_PROMPT === "1") return fullPrompt;
  const { volatile } = splitStableVolatile(fullPrompt);
  return [
    "# Vanta local runtime",
    "You are Vanta, a trusted local operator. Turn the user's requested outcome into safe, visible, verified work.",
    `Your working directory is ${repoRoot}. Relative shell paths resolve from the active working directory. File reads and writes default to this root; use the exact absolute path for a user-requested destination outside it and let the tool request scoped approval. Every tool action is checked by the safety kernel.`,
    "Use the provided tools instead of inventing file contents or command results. Before editing a repository, read AGENTS.md and any directly relevant project instructions with read_file. Inspect before changing, make the smallest coherent change, then run the narrowest real verification.",
    "Never run destructive commands or bypass approval. Stop and report an unavailable permission, tool, or dependency. Never claim done, fixed, or working without tool-backed evidence from the actual requested path.",
    "Keep responses concise. Report what changed, what was executed, what the evidence does not prove, and what remains.",
    volatile,
  ].filter(Boolean).join("\n\n");
}

function localMaxTokens(env: NodeJS.ProcessEnv): number | null {
  const configured = Number(env.VANTA_LOCAL_MAX_TOKENS ?? 512);
  if (!Number.isFinite(configured) || configured <= 0) return null;
  return Math.max(64, Math.min(16_384, Math.floor(configured)));
}

function boundedConfig(config: CompletionConfig | undefined, maxTokens: number): CompletionConfig {
  return config?.maxTokens === undefined ? { ...config, maxTokens } : config;
}

/** Bound local generation turns so malformed output returns control to recovery. */
export function applyLocalRuntimeLimits(provider: LLMProvider, env: NodeJS.ProcessEnv): LLMProvider {
  const maxTokens = localMaxTokens(env);
  if (provider.routeInfo?.().billingMode !== "local" || maxTokens === null) return provider;
  return {
    complete: (messages, tools, config) => provider.complete(messages, tools, boundedConfig(config, maxTokens)),
    modelId: () => provider.modelId(),
    contextWindow: () => provider.contextWindow(),
    routeInfo: provider.routeInfo ? () => provider.routeInfo!() : undefined,
    countTokens: provider.countTokens ? (messages, tools) => provider.countTokens!(messages, tools) : undefined,
    stream: provider.stream
      ? async function* (messages, tools, config) {
          yield* provider.stream!(messages, tools, boundedConfig(config, maxTokens));
        }
      : undefined,
  };
}
