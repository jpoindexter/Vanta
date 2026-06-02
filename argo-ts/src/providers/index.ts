import { OpenAIProvider } from "./openai.js";
import type { LLMProvider } from "./interface.js";

const DEFAULT_OLLAMA_URL = "http://localhost:11434/v1";

/**
 * Resolve an LLM provider from environment.
 *   ARGO_PROVIDER=openai    → api.openai.com (needs OPENAI_API_KEY)
 *   ARGO_PROVIDER=ollama    → local Ollama, OpenAI-compatible
 *   ARGO_PROVIDER=anthropic → Phase 4, not yet implemented
 */
export function resolveProvider(env: NodeJS.ProcessEnv): LLMProvider {
  const provider = (env.ARGO_PROVIDER ?? "openai").toLowerCase();
  const model = env.ARGO_MODEL;

  switch (provider) {
    case "openai": {
      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "OPENAI_API_KEY is not set. Set it in argo-ts/.env, or use ARGO_PROVIDER=ollama for local models.",
        );
      }
      return new OpenAIProvider({ apiKey, model: model ?? "gpt-4o-mini" });
    }
    case "ollama":
      return new OpenAIProvider({
        apiKey: "ollama",
        baseURL: env.ARGO_OLLAMA_URL ?? DEFAULT_OLLAMA_URL,
        model: model ?? "qwen2.5:14b",
      });
    case "anthropic":
      throw new Error(
        "Anthropic provider arrives in Phase 4. Use ARGO_PROVIDER=openai or ollama for now.",
      );
    default:
      throw new Error(
        `Unknown ARGO_PROVIDER "${provider}". Use openai, ollama, or anthropic.`,
      );
  }
}

export type { LLMProvider } from "./interface.js";
