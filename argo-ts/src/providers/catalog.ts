/**
 * Small shared catalog of the provider backends the setup wizard offers and
 * `argo doctor` reports on. This is intentionally NOT the full Hermes-style
 * ProviderProfile registry — it's the minimum the wizard/doctor need to stay in
 * sync with {@link resolveProvider}. Extend `resolveProvider` and this list
 * together when adding a backend; build the registry only when a third wire
 * format or the ~6th provider forces it.
 */
export type ProviderEntry = {
  /** ARGO_PROVIDER value. */
  id: string;
  /** Human label for the picker. */
  label: string;
  /** API-key env var, or null for keyless backends (Ollama). */
  envVar: string | null;
  /** Default model written if the user accepts it. */
  defaultModel: string;
  /** Where to get a key (shown in the wizard). */
  signupUrl?: string;
  /** One-line hint shown under the label. */
  note?: string;
};

export const PROVIDER_CATALOG: ProviderEntry[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    envVar: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-flash",
    signupUrl: "https://aistudio.google.com/apikey",
    note: "free tier available",
  },
  {
    id: "openai",
    label: "OpenAI (ChatGPT models)",
    envVar: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    signupUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    envVar: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-6",
    signupUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter (one key → 200+ models)",
    envVar: "OPENROUTER_API_KEY",
    defaultModel: "anthropic/claude-sonnet-4.5",
    signupUrl: "https://openrouter.ai/keys",
  },
  {
    id: "ollama",
    label: "Ollama (local, no key)",
    envVar: null,
    defaultModel: "qwen2.5:14b",
    note: "needs Ollama running locally",
  },
];

export function providerById(id: string): ProviderEntry | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === id);
}
