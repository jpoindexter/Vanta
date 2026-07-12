import type {
  CompletionConfig,
  CompletionResult,
  LLMProvider,
  ProviderRoute,
  StreamChunk,
  ToolSchema,
} from "./interface.js";
import type { Message } from "../types.js";

export function normalizeBaseRoute(value: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) return value.replace(/\/+$/, "");
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "") || "/"}`;
  } catch {
    return value.replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

function routedResult(result: CompletionResult, route: ProviderRoute): CompletionResult {
  return { ...result, servedRoute: result.servedRoute ?? route };
}

/** Decorate any provider without changing its transport implementation. */
export function withProviderRoute(provider: LLMProvider, route: Omit<ProviderRoute, "model">): LLMProvider {
  const routeInfo = (): ProviderRoute => ({ ...route, model: provider.modelId() });
  return {
    modelId: () => provider.modelId(),
    contextWindow: () => provider.contextWindow(),
    routeInfo,
    complete: async (messages: Message[], tools: ToolSchema[], config?: CompletionConfig) =>
      routedResult(await provider.complete(messages, tools, config), routeInfo()),
    ...(provider.stream
      ? {
          stream: async function* (messages: Message[], tools: ToolSchema[], config?: CompletionConfig): AsyncIterable<StreamChunk> {
            for await (const chunk of provider.stream!(messages, tools, config)) {
              yield chunk.type === "done" ? { ...chunk, result: routedResult(chunk.result, routeInfo()) } : chunk;
            }
          },
        }
      : {}),
    ...(provider.countTokens
      ? { countTokens: (messages: Message[], tools: ToolSchema[]) => provider.countTokens!(messages, tools) }
      : {}),
  };
}
