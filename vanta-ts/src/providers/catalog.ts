/**
 * Small shared catalog of the provider backends the setup wizard offers and
 * `vanta doctor` reports on. This is intentionally NOT a full ProviderProfile
 * registry — it's the minimum the wizard/doctor need to stay in
 * sync with {@link resolveProvider}. Extend `resolveProvider` and this list
 * together when adding a backend; build the registry only when a third wire
 * format or the ~6th provider forces it.
 */
export type ProviderEntry = {
  /** VANTA_PROVIDER value. */
  id: string;
  /** Human label for the picker. */
  label: string;
  /** Short name for the /model picker rows. */
  short: string;
  /** API-key env var, or null for keyless backends (Ollama). */
  envVar: string | null;
  /** Default model written if the user accepts it. */
  defaultModel: string;
  /**
   * Offline model floor surfaced in the /model picker. The desktop augments this
   * with provider-backed discovery and still accepts a free-typed ID, so launches,
   * routers, and machine-local models remain reachable without a Vanta release.
   */
  models: string[];
  /** Where to get a key (shown in the wizard). */
  signupUrl?: string;
  /** One-line hint shown under the label. */
  note?: string;
  /**
   * A model ROUTER (TokenRouter, OpenRouter, …): one token reaches every model it
   * proxies, so the wizard shouldn't pin a fixed list — it goes straight to a
   * free-typed model id (`models` stays a short example set). `VANTA_MODEL` accepts
   * any id regardless; this just makes "any model" the default UX for routers.
   */
  router?: boolean;
};

// Reused by both API-key Anthropic and the Pro/Max subscription backend.
const ANTHROPIC_MODELS = [
  "claude-fable-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-sonnet-4-5",
  "claude-opus-4-1",
];

const OPENAI_API_MODELS = [
  "gpt-5.6",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
  "gpt-5.5-2026-04-23",
  "gpt-5.5-pro",
  "gpt-5.4",
  "gpt-5.4-2026-03-05",
  "gpt-5.4-pro",
  "gpt-5.4-mini",
  "gpt-5.4-mini-2026-03-17",
  "gpt-5.4-nano",
  "gpt-5.4-nano-2026-03-17",
  "gpt-5.3-codex",
  "gpt-5.2",
  "gpt-5.2-2025-12-11",
  "gpt-5.2-pro",
  "gpt-5.1",
  "gpt-5.1-2025-11-13",
  "gpt-5",
  "gpt-5-2025-08-07",
  "gpt-5-pro",
  "gpt-5-pro-2025-10-06",
  "gpt-5-mini",
  "gpt-5-mini-2025-08-07",
  "gpt-5-nano",
  "gpt-5-nano-2025-08-07",
  "gpt-5-chat-latest",
  "gpt-5-chat-latest-2025-08-07",
  "gpt-4.1",
  "gpt-4.1-2025-04-14",
  "gpt-4.1-mini",
  "gpt-4.1-mini-2025-04-14",
  "gpt-4.1-nano",
  "gpt-4.1-nano-2025-04-14",
  "gpt-4o",
  "gpt-4o-2024-11-20",
  "gpt-4o-2024-08-06",
  "gpt-4o-mini",
  "gpt-4o-mini-2024-07-18",
  "o3-pro",
  "o3",
  "o3-2025-04-16",
  "o4-mini",
  "o4-mini-2025-04-16",
  "o1-pro",
  "o1-pro-2025-03-19",
  "o3-mini",
  "o3-mini-2025-01-31",
  "o1",
  "o1-2024-12-17",
  "o1-mini",
  "o1-mini-2024-09-12",
  "o1-preview",
  "computer-use-preview",
  "gpt-4-turbo",
  "gpt-4-turbo-2024-04-09",
  "gpt-4-0613",
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-0125",
];

const CODEX_SUBSCRIPTION_MODELS = [
  "gpt-5.6",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.2",
  "gpt-5.2-pro",
  "gpt-5.2-codex",
  "gpt-5.1",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  "gpt-5",
  "gpt-5-pro",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5-codex",
  "gpt-5-codex-mini",
];

export const PROVIDER_CATALOG: ProviderEntry[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    short: "Gemini",
    envVar: "GEMINI_API_KEY",
    defaultModel: "gemini-3.5-flash",
    models: [
      "gemini-3.5-flash",
      "gemini-3.1-pro-preview",
      "gemini-3.1-pro-preview-customtools",
      "gemini-3.1-flash-lite",
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.5-flash-lite",
    ],
    signupUrl: "https://aistudio.google.com/apikey",
    note: "free tier available",
  },
  {
    id: "openai",
    label: "OpenAI (ChatGPT models)",
    short: "OpenAI",
    envVar: "OPENAI_API_KEY",
    defaultModel: "gpt-5.6-sol",
    models: OPENAI_API_MODELS,
    signupUrl: "https://platform.openai.com/api-keys",
    note: "GPT-5.6 Sol for complex coding; GPT-5.6 Terra/Luna for lower cost. Includes current dated OpenAI snapshots for exact pinning.",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude, API key)",
    short: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-5",
    models: ANTHROPIC_MODELS,
    signupUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "claude-code",
    label: "Claude via Pro/Max subscription (uses your `claude` login — grey area)",
    short: "Claude (sub)",
    envVar: null,
    defaultModel: "claude-sonnet-5",
    models: ANTHROPIC_MODELS,
    note: "needs `claude` signed in; subscription token use is a grey area under Anthropic ToS",
  },
  {
    id: "openrouter",
    label: "OpenRouter (one key → 200+ models)",
    short: "OpenRouter",
    envVar: "OPENROUTER_API_KEY",
    defaultModel: "anthropic/claude-sonnet-4.5",
    models: [
      "anthropic/claude-sonnet-4.5",
      "anthropic/claude-opus-4.1",
      "openai/gpt-4o",
      "google/gemini-2.5-pro",
      "meta-llama/llama-3.3-70b-instruct",
      "deepseek/deepseek-chat",
    ],
    signupUrl: "https://openrouter.ai/keys",
    router: true,
  },
  {
    id: "codex",
    label: "OpenAI Codex via ChatGPT subscription (uses your `codex` login)",
    short: "Codex (sub)",
    envVar: null,
    defaultModel: "gpt-5.6-sol",
    models: CODEX_SUBSCRIPTION_MODELS,
    // Model guidance (OpenAI Codex docs, verified 2026-07): GPT-5.6 Sol is the
    // default flagship; Terra is the balanced everyday option; Luna suits clear,
    // repeatable work. Older Codex-agent IDs remain visible so the picker covers
    // existing agent sessions instead of forcing users to free-type them.
    note: "needs `codex login` (ChatGPT Plus/Pro); Responses API. Shows the signed-in Codex set, including GPT-5.6 Sol/Terra/Luna plus older Codex-agent IDs used by existing sessions.",
  },
  {
    id: "ollama",
    label: "Ollama (local, no key)",
    short: "Ollama",
    envVar: null,
    defaultModel: "qwen2.5:14b",
    models: ["qwen2.5:14b", "llama3.3", "deepseek-r1:14b", "mistral-small"],
    note: "needs Ollama running locally",
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM (OpenAI-compatible inference)",
    short: "NVIDIA",
    envVar: "NVIDIA_API_KEY",
    defaultModel: "meta/llama-3.1-70b-instruct",
    models: [
      "meta/llama-3.1-70b-instruct",
      "meta/llama-3.1-8b-instruct",
      "nvidia/llama-3.1-nemotron-70b-instruct",
      "mistralai/mixtral-8x7b-instruct-v0.1",
      "google/gemma-2-27b-it",
    ],
    signupUrl: "https://build.nvidia.com/settings/api-keys",
    note: "NVIDIA NIM — cloud inference at integrate.api.nvidia.com",
  },
  { id: "deepseek", label: "DeepSeek (V3, R1, coder)", short: "DeepSeek", envVar: "DEEPSEEK_API_KEY", defaultModel: "deepseek-chat", models: ["deepseek-chat", "deepseek-reasoner"], signupUrl: "https://platform.deepseek.com/api_keys" },
  { id: "xai", label: "xAI Grok (direct API)", short: "Grok", envVar: "XAI_API_KEY", defaultModel: "grok-4", models: ["grok-4", "grok-3", "grok-3-mini", "grok-2-1212"], signupUrl: "https://console.x.ai" },
  { id: "groq", label: "Groq (fast inference)", short: "Groq", envVar: "GROQ_API_KEY", defaultModel: "llama-3.3-70b-versatile", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "deepseek-r1-distill-llama-70b", "qwen-2.5-32b"], signupUrl: "https://console.groq.com/keys" },
  { id: "mistral", label: "Mistral AI", short: "Mistral", envVar: "MISTRAL_API_KEY", defaultModel: "mistral-large-latest", models: ["mistral-large-latest", "mistral-small-latest", "codestral-latest", "ministral-8b-latest"], signupUrl: "https://console.mistral.ai/api-keys" },
  { id: "together", label: "Together AI (open models)", short: "Together", envVar: "TOGETHER_API_KEY", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo", models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct-Turbo"], signupUrl: "https://api.together.ai" },
  { id: "fireworks", label: "Fireworks AI", short: "Fireworks", envVar: "FIREWORKS_API_KEY", defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct", models: ["accounts/fireworks/models/llama-v3p3-70b-instruct", "accounts/fireworks/models/deepseek-v3", "accounts/fireworks/models/qwen2p5-72b-instruct"], signupUrl: "https://fireworks.ai/account/api-keys" },
  { id: "cerebras", label: "Cerebras (ultra-fast)", short: "Cerebras", envVar: "CEREBRAS_API_KEY", defaultModel: "llama-3.3-70b", models: ["llama-3.3-70b", "llama3.1-8b", "qwen-3-32b"], signupUrl: "https://cloud.cerebras.ai" },
  { id: "moonshot", label: "Moonshot / Kimi", short: "Kimi", envVar: "MOONSHOT_API_KEY", defaultModel: "kimi-k2-0905-preview", models: ["kimi-k2-0905-preview", "moonshot-v1-128k", "moonshot-v1-32k"], signupUrl: "https://platform.moonshot.ai/console/api-keys" },
  { id: "minimax", label: "MiniMax", short: "MiniMax", envVar: "MINIMAX_API_KEY", defaultModel: "MiniMax-M2", models: ["MiniMax-M2", "abab6.5s-chat"], signupUrl: "https://www.minimax.io/platform" },
  { id: "tokenrouter", label: "TokenRouter (one key → many models)", short: "TokenRouter", envVar: "TOKENROUTER_API_KEY", defaultModel: "MiniMax-M3", models: ["MiniMax-M3"], signupUrl: "https://www.tokenrouter.com/", router: true },
  { id: "zai", label: "Z.AI / GLM (Zhipu)", short: "GLM", envVar: "ZAI_API_KEY", defaultModel: "glm-4.6", models: ["glm-4.6", "glm-4.5", "glm-4-flash"], signupUrl: "https://z.ai/manage-apikey/apikey-list" },
  { id: "qwen", label: "Qwen / DashScope (Alibaba)", short: "Qwen", envVar: "DASHSCOPE_API_KEY", defaultModel: "qwen-max", models: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen2.5-72b-instruct"], signupUrl: "https://dashscope.console.aliyun.com" },
  { id: "novita", label: "NovitaAI (open models)", short: "Novita", envVar: "NOVITA_API_KEY", defaultModel: "deepseek/deepseek-v3-0324", models: ["deepseek/deepseek-v3-0324", "meta-llama/llama-3.3-70b-instruct", "qwen/qwen-2.5-72b-instruct"], signupUrl: "https://novita.ai/settings/key-management" },
  { id: "perplexity", label: "Perplexity (Sonar, web-grounded)", short: "Perplexity", envVar: "PERPLEXITY_API_KEY", defaultModel: "sonar", models: ["sonar", "sonar-pro", "sonar-reasoning", "sonar-reasoning-pro"], signupUrl: "https://www.perplexity.ai/settings/api" },
  { id: "huggingface", label: "Hugging Face (Inference Providers)", short: "HF", envVar: "HF_TOKEN", defaultModel: "meta-llama/Llama-3.3-70B-Instruct", models: ["meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3"], signupUrl: "https://huggingface.co/settings/tokens" },
  { id: "lmstudio", label: "LM Studio (local desktop server)", short: "LM Studio", envVar: null, defaultModel: "local-model", models: ["local-model"], note: "LM Studio → Developer → Start Server (localhost:1234), no key" },
  { id: "stepfun", label: "StepFun (Step models)", short: "StepFun", envVar: "STEPFUN_API_KEY", defaultModel: "step-2-16k", models: ["step-2-16k", "step-1-8k", "step-1-32k"], signupUrl: "https://platform.stepfun.com" },
  { id: "azure", label: "Azure OpenAI / AI Foundry", short: "Azure", envVar: "AZURE_OPENAI_API_KEY", defaultModel: "gpt-4o", models: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini"], note: "also set AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_DEPLOYMENT" },
  { id: "custom", label: "Custom OpenAI-compatible endpoint", short: "Custom", envVar: null, defaultModel: "default", models: ["default"], note: "set VANTA_OPENAI_BASE_URL (+ VANTA_OPENAI_KEY) — covers Arcee · GMI · Kilo · OpenCode · any OpenAI-compatible API" },
];

export function providerById(id: string): ProviderEntry | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === id);
}

export type { ModelCapability } from "./model-caps.js";
export { modelSupports } from "./model-caps.js";
