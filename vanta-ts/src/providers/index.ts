import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { CodexProvider } from "./codex.js";
import { resolveClaudeCodeToken } from "./claude-code-auth.js";
import type { LLMProvider } from "./interface.js";

const DEFAULT_OLLAMA_URL = "http://localhost:11434/v1";
const GEMINI_OPENAI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const OPENROUTER_URL = "https://openrouter.ai/api/v1";

function requireKey(env: NodeJS.ProcessEnv, key: string, hint: string): string {
  const val = env[key];
  if (!val) throw new Error(`${key} is not set. ${hint}`);
  return val;
}

function makeOpenAI(env: NodeJS.ProcessEnv): LLMProvider {
  const apiKey = requireKey(env, "OPENAI_API_KEY",
    "Run `vanta setup`, or set it in vanta-ts/.env, or use VANTA_PROVIDER=ollama for local models.");
  return new OpenAIProvider({ apiKey, model: env.VANTA_MODEL ?? "gpt-4o-mini" });
}

function makeOllama(env: NodeJS.ProcessEnv): LLMProvider {
  return new OpenAIProvider({
    apiKey: "ollama",
    baseURL: env.VANTA_OLLAMA_URL ?? DEFAULT_OLLAMA_URL,
    model: env.VANTA_MODEL ?? "qwen2.5:14b",
  });
}

function makeAnthropic(env: NodeJS.ProcessEnv): LLMProvider {
  const apiKey = requireKey(env, "ANTHROPIC_API_KEY",
    "Run `vanta setup`, set it in vanta-ts/.env, use VANTA_PROVIDER=claude-code for a Claude subscription, or VANTA_PROVIDER=openai|ollama.");
  return new AnthropicProvider({ apiKey, model: env.VANTA_MODEL ?? "claude-sonnet-4-6" });
}

function makeCodex(env: NodeJS.ProcessEnv): LLMProvider {
  return new CodexProvider({ model: env.VANTA_MODEL ?? "gpt-5.5" });
}

function makeClaudeCode(env: NodeJS.ProcessEnv): LLMProvider {
  return new AnthropicProvider({ authToken: resolveClaudeCodeToken(env), model: env.VANTA_MODEL ?? "claude-sonnet-4-6" });
}

function makeGemini(env: NodeJS.ProcessEnv): LLMProvider {
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set. Run `vanta setup`, or get a key at https://aistudio.google.com/apikey and set GEMINI_API_KEY in vanta-ts/.env.");
  return new OpenAIProvider({ apiKey, baseURL: GEMINI_OPENAI_URL, model: env.VANTA_MODEL ?? "gemini-2.5-flash" });
}

function makeOpenRouter(env: NodeJS.ProcessEnv): LLMProvider {
  const apiKey = requireKey(env, "OPENROUTER_API_KEY",
    "Run `vanta setup`, or get a key at https://openrouter.ai/keys and set OPENROUTER_API_KEY in vanta-ts/.env.");
  return new OpenAIProvider({ apiKey, baseURL: OPENROUTER_URL, model: env.VANTA_MODEL ?? "anthropic/claude-sonnet-4.5" });
}

const PROVIDERS: Record<string, (env: NodeJS.ProcessEnv) => LLMProvider> = {
  openai: makeOpenAI,
  ollama: makeOllama,
  anthropic: makeAnthropic,
  codex: makeCodex,
  "openai-codex": makeCodex,
  "claude-code": makeClaudeCode,
  "claude-cli": makeClaudeCode,
  gemini: makeGemini,
  openrouter: makeOpenRouter,
};

/**
 * Resolve an LLM provider from environment.
 *   VANTA_PROVIDER=openai     → api.openai.com (needs OPENAI_API_KEY)
 *   VANTA_PROVIDER=ollama     → local Ollama, OpenAI-compatible
 *   VANTA_PROVIDER=anthropic  → api.anthropic.com (needs ANTHROPIC_API_KEY)
 *   VANTA_PROVIDER=gemini     → Google Gemini via OpenAI-compat (needs GEMINI_API_KEY)
 *   VANTA_PROVIDER=openrouter → OpenRouter (needs OPENROUTER_API_KEY)
 *   VANTA_PROVIDER=claude-code → Claude via your Pro/Max subscription token (grey area)
 *   VANTA_PROVIDER=codex      → OpenAI Codex via your ChatGPT subscription (OAuth)
 */
export function resolveProvider(env: NodeJS.ProcessEnv): LLMProvider {
  const id = (env.VANTA_PROVIDER ?? "openai").toLowerCase();
  const factory = PROVIDERS[id];
  if (!factory) throw new Error(`Unknown VANTA_PROVIDER "${id}". Use openai, ollama, anthropic, gemini, openrouter, codex, or claude-code.`);
  return factory(env);
}

export type { LLMProvider } from "./interface.js";
