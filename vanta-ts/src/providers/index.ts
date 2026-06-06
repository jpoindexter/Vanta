import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { CodexProvider } from "./codex.js";
import { resolveClaudeCodeToken } from "./claude-code-auth.js";
import type { LLMProvider } from "./interface.js";

const DEFAULT_OLLAMA_URL = "http://localhost:11434/v1";
// Gemini speaks the OpenAI chat-completions format at this endpoint, so the
// OpenAI adapter covers it with a baseURL swap (verified 2026-06: ai.google.dev/gemini-api/docs/openai).
const GEMINI_OPENAI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
// OpenRouter: one key → 200+ models (Claude/GPT/Gemini/Llama), OpenAI-compatible.
const OPENROUTER_URL = "https://openrouter.ai/api/v1";

/**
 * Resolve an LLM provider from environment.
 *   VANTA_PROVIDER=openai     → api.openai.com (needs OPENAI_API_KEY)
 *   VANTA_PROVIDER=ollama     → local Ollama, OpenAI-compatible
 *   VANTA_PROVIDER=anthropic  → api.anthropic.com (needs ANTHROPIC_API_KEY)
 *   VANTA_PROVIDER=gemini      → Google Gemini via OpenAI-compat (needs GEMINI_API_KEY)
 *   VANTA_PROVIDER=openrouter  → OpenRouter (needs OPENROUTER_API_KEY)
 *   VANTA_PROVIDER=claude-code → Claude via your Pro/Max subscription token (grey area)
 *   VANTA_PROVIDER=codex       → OpenAI Codex via your ChatGPT subscription (OAuth, `codex login`)
 */
export function resolveProvider(env: NodeJS.ProcessEnv): LLMProvider {
  const provider = (env.VANTA_PROVIDER ?? "openai").toLowerCase();
  const model = env.VANTA_MODEL;

  switch (provider) {
    case "openai": {
      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "OPENAI_API_KEY is not set. Run `vanta setup`, or set it in vanta-ts/.env, or use VANTA_PROVIDER=ollama for local models.",
        );
      }
      return new OpenAIProvider({ apiKey, model: model ?? "gpt-4o-mini" });
    }
    case "ollama":
      return new OpenAIProvider({
        apiKey: "ollama",
        baseURL: env.VANTA_OLLAMA_URL ?? DEFAULT_OLLAMA_URL,
        model: model ?? "qwen2.5:14b",
      });
    case "anthropic": {
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY is not set. Run `vanta setup`, set it in vanta-ts/.env, use VANTA_PROVIDER=claude-code for a Claude subscription, or VANTA_PROVIDER=openai|ollama.",
        );
      }
      return new AnthropicProvider({
        apiKey,
        model: model ?? "claude-sonnet-4-6",
      });
    }
    case "codex":
    case "openai-codex": {
      // OpenAI Codex via your ChatGPT subscription. Uses the shared
      // ~/.codex/auth.json OAuth session (run `codex login`). Speaks the
      // Responses API; constructor throws actionably if not logged in.
      return new CodexProvider({ model: model ?? "gpt-5.5" });
    }
    case "claude-code":
    case "claude-cli": {
      // Grey area: uses your Claude Pro/Max OAuth token (from `claude`) against
      // the Messages API with Claude-Code headers. Throws actionable if not
      // logged in / expired. See DECISIONS 2026-06-02.
      return new AnthropicProvider({
        authToken: resolveClaudeCodeToken(env),
        model: model ?? "claude-sonnet-4-6",
      });
    }
    case "gemini": {
      const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error(
          "GEMINI_API_KEY is not set. Run `vanta setup`, or get a key at https://aistudio.google.com/apikey and set GEMINI_API_KEY in vanta-ts/.env.",
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
          "OPENROUTER_API_KEY is not set. Run `vanta setup`, or get a key at https://openrouter.ai/keys and set OPENROUTER_API_KEY in vanta-ts/.env.",
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
        `Unknown VANTA_PROVIDER "${provider}". Use openai, ollama, anthropic, gemini, openrouter, codex, or claude-code.`,
      );
  }
}

export type { LLMProvider } from "./interface.js";
