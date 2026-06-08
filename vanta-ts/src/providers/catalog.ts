/**
 * Small shared catalog of the provider backends the setup wizard offers and
 * `vanta doctor` reports on. This is intentionally NOT the full Hermes-style
 * ProviderProfile registry — it's the minimum the wizard/doctor need to stay in
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
   * Curated model IDs surfaced in the /model picker. NOT exhaustive — the picker
   * also accepts any free-typed ID, which is how OpenRouter's 200+ and Ollama's
   * machine-local models stay reachable. Live model listing is a later upgrade.
   */
  models: string[];
  /** Where to get a key (shown in the wizard). */
  signupUrl?: string;
  /** One-line hint shown under the label. */
  note?: string;
};

// Reused by both API-key Anthropic and the Pro/Max subscription backend.
const ANTHROPIC_MODELS = [
  "claude-opus-4-8",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-sonnet-4-5",
  "claude-opus-4-1",
];

export const PROVIDER_CATALOG: ProviderEntry[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    short: "Gemini",
    envVar: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-flash",
    models: [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-pro",
    ],
    signupUrl: "https://aistudio.google.com/apikey",
    note: "free tier available",
  },
  {
    id: "openai",
    label: "OpenAI (ChatGPT models)",
    short: "OpenAI",
    envVar: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    models: [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "o3",
      "o4-mini",
      "o3-mini",
      "gpt-4-turbo",
      "gpt-3.5-turbo",
    ],
    signupUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude, API key)",
    short: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-6",
    models: ANTHROPIC_MODELS,
    signupUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "claude-code",
    label: "Claude via Pro/Max subscription (uses your `claude` login — grey area)",
    short: "Claude (sub)",
    envVar: null,
    defaultModel: "claude-sonnet-4-6",
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
  },
  {
    id: "codex",
    label: "OpenAI Codex via ChatGPT subscription (uses your `codex` login)",
    short: "Codex (sub)",
    envVar: null,
    defaultModel: "gpt-5.5",
    models: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex-spark"],
    note: "needs `codex login` (ChatGPT Plus/Pro); uses the Responses API",
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
];

export function providerById(id: string): ProviderEntry | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === id);
}

/**
 * Optional params a model may or may not accept. Providers check this before
 * sending a param so free-typed OpenRouter/Ollama IDs don't 400/500.
 * Default for unknown model + unknown capability: true (allow).
 */
export type ModelCapability = "temperature" | "reasoning_effort" | "thinking";

// Prefix patterns that LACK a capability. Checked in order; first match wins.
// Unknown model → falls through → default allow.
const BLOCKS: Array<{ prefixes: string[]; blocks: ModelCapability[] }> = [
  {
    // OpenAI o-series: no temperature, but supports reasoning_effort
    prefixes: ["o1", "o3", "o4"],
    blocks: ["temperature"],
  },
  {
    // Older Claude (pre-3.7 / pre-4): no extended thinking
    prefixes: ["claude-1", "claude-2", "claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
    blocks: ["thinking"],
  },
];

// Prefix patterns that explicitly SUPPORT a capability (overrides default false).
const ALLOWS: Array<{ prefixes: string[]; allows: ModelCapability[] }> = [
  {
    prefixes: ["o1", "o3", "o4"],
    allows: ["reasoning_effort"],
  },
  {
    // Claude 3.7+ and Claude 4 support extended thinking
    prefixes: ["claude-3-7", "claude-sonnet-4", "claude-opus-4", "claude-haiku-4"],
    allows: ["thinking"],
  },
];

/**
 * Returns whether a model supports a given optional capability.
 * Defaults to `true` (allow) for unknown models or unknown capabilities —
 * it's better to attempt and get a provider error than silently drop a feature.
 */
export function modelSupports(modelId: string, capability: ModelCapability): boolean {
  for (const { prefixes, blocks } of BLOCKS) {
    if (prefixes.some((p) => modelId.startsWith(p)) && (blocks as string[]).includes(capability)) {
      return false;
    }
  }
  // For capabilities with explicit allow-lists, check if this model is listed.
  const hasAllowList = ALLOWS.some((a) => (a.allows as string[]).includes(capability));
  if (hasAllowList) {
    return ALLOWS.some(
      ({ prefixes, allows }) =>
        (allows as string[]).includes(capability) && prefixes.some((p) => modelId.startsWith(p)),
    );
  }
  return true;
}
