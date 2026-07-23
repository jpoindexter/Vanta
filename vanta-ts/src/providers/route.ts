import type {
  CompletionConfig,
  CompletionResult,
  LLMProvider,
  ProviderRoute,
  StreamChunk,
  ToolSchema,
} from "./interface.js";
import type { Message } from "../types.js";

const RUNTIME_ROUTE_BLOCK = /(?:\r?\n)*<vanta_runtime_route>[\s\S]*?<\/vanta_runtime_route>(?:\r?\n)*/g;

function promptSafe(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Tell the model which provider route is actually serving this call. The block
 * is injected at the transport boundary so a fallback provider receives its
 * own identity, while stored conversation history stays route-neutral.
 */
export function withRuntimeRoute(messages: Message[], route: ProviderRoute): Message[] {
  const block = [
    "<vanta_runtime_route>",
    "Authoritative active runtime for this call:",
    `Active provider: ${promptSafe(route.provider)}`,
    `Active model: ${promptSafe(route.model)}`,
    `Billing route: ${promptSafe(route.billingMode)}`,
    "When asked which provider or model is active, answer with these values directly. Do not infer identity from API compatibility, prior messages, or interface branding.",
    "</vanta_runtime_route>",
  ].join("\n");
  let injected = false;
  const routed = messages.map((message): Message => {
    if (injected || message.role !== "system") return message;
    injected = true;
    const base = message.content.replace(RUNTIME_ROUTE_BLOCK, "\n").trimEnd();
    return { ...message, content: `${base}\n\n${block}` };
  });
  return injected ? routed : [{ role: "system", content: block }, ...routed];
}

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
    complete: async (messages: Message[], tools: ToolSchema[], config?: CompletionConfig) => {
      const activeRoute = routeInfo();
      return routedResult(
        await provider.complete(withRuntimeRoute(messages, activeRoute), tools, config),
        activeRoute,
      );
    },
    ...(provider.stream
      ? {
          stream: async function* (messages: Message[], tools: ToolSchema[], config?: CompletionConfig): AsyncIterable<StreamChunk> {
            const activeRoute = routeInfo();
            for await (const chunk of provider.stream!(withRuntimeRoute(messages, activeRoute), tools, config)) {
              yield chunk.type === "done" ? { ...chunk, result: routedResult(chunk.result, activeRoute) } : chunk;
            }
          },
        }
      : {}),
    ...(provider.countTokens
      ? {
          countTokens: (messages: Message[], tools: ToolSchema[]) => {
            const activeRoute = routeInfo();
            return provider.countTokens!(withRuntimeRoute(messages, activeRoute), tools);
          },
        }
      : {}),
  };
}
