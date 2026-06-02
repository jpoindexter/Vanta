import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import type { LLMProvider } from "./interface.js";

const DEFAULT_OLLAMA_URL = "http://localhost:11434/v1";
// Gemini speaks the OpenAI chat-completions format at this endpoint, so the
// OpenAI adapter covers it with a baseURL swap (verified 2026-06: ai.google.dev/gemini-api/docs/openai).
const GEMINI_OPENAI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
// OpenRouter: one key → 200+ models (Claude/GPT/Gemini/Llama), OpenAI-compatible.
const OPENROUTER_URL = "https://openrouter.ai/api/v1";

/**
 * Resolve an LLM provider from environment.
 *   ARGO_PROVIDER=openai     → api.openai.com (needs OPENAI_API_KEY)
 *   ARGO_PROVIDER=ollama     → local Ollama, OpenAI-compatible
 *   ARGO_PROVIDER=anthropic  → api.anthropic.com (needs ANTHROPIC_API_KEY)
 *   ARGO_PROVIDER=gemini     → Google Gemini via OpenAI-compat (needs GEMINI_API_KEY)
 *   ARGO_PROVIDER=openrouter → OpenRouter (needs OPENROUTER_API_KEY)
 */
export function resolveProvider(env: NodeJS.ProcessEnv): LLMProvider {
  const provider = (env.ARGO_PROVIDER ?? "openai").toLowerCase();
  const model = env.ARGO_MODEL;

  switch (provider) {
    case "openai": {
      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "OPENAI_API_KEY is not set. Run `argo setup`, or set it in argo-ts/.env, or use ARGO_PROVIDER=ollama for local models.",
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
    case "anthropic": {
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY is not set. Run `argo setup`, or set it in argo-ts/.env, or use ARGO_PROVIDER=openai|ollama.",
        );
      }
      return new AnthropicProvider({
        apiKey,
        model: model ?? "claude-sonnet-4-6",
      });
    }
    case "gemini": {
      const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error(
          "GEMINI_API_KEY is not set. Run `argo setup`, or get a key at https://aistudio.google.com/apikey and set GEMINI_API_KEY in argo-ts/.env.",
        );
      }
      return new OpenAIProvider({
        apiKey,
        baseURL: GEMINI_OPENAI_URL,
        model: model ?? "gemini-2.5-flash",
      });
    }
    case "openrouter": {
      const apiKey = env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error(
          "OPENROUTER_API_KEY is not set. Run `argo setup`, or get a key at https://openrouter.ai/keys and set OPENROUTER_API_KEY in argo-ts/.env.",
        );
      }
      return new OpenAIProvider({
        apiKey,
        baseURL: OPENROUTER_URL,
        model: model ?? "anthropic/claude-sonnet-4.5",
      });
    }
    default:
      throw new Error(
        `Unknown ARGO_PROVIDER "${provider}". Use openai, ollama, anthropic, gemini, or openrouter.`,
      );
  }
}

export type { LLMProvider } from "./interface.js";
