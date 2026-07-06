// EXT-MODEL-NORMALIZE — canonicalize a model id for the TARGET provider before
// the API call, killing the "right model, wrong id-shape" 400s. Two real quirk
// classes the routed providers actually hit:
//   OpenRouter wants `vendor/model` (e.g. `anthropic/claude-sonnet-4.5`) — a bare
//     `claude-sonnet-4.5` 400s; prepend the detected vendor.
//   Native openai/anthropic/gemini want a BARE id — an OpenRouter-style
//     `openai/gpt-4o` 400s; strip a known-vendor prefix.
// Freeform-id backends (ollama/custom/openai-compat) pass through untouched —
// their ids legitimately vary (tags, hf.co/… paths), so guessing would do harm.
// Tiny + pure. Unknown vendor → leave the id alone (never fabricate a prefix).

/** Vendor prefixes OpenRouter uses, keyed by a bare-id signal. Order = priority. */
const VENDOR_BY_PREFIX: ReadonlyArray<[RegExp, string]> = [
  [/^(gpt-|o1|o3|o4|chatgpt|text-|davinci)/, "openai"],
  [/^claude/, "anthropic"],
  [/^gemini/, "google"],
  [/^(llama|meta-llama)/, "meta-llama"],
  [/^(mistral|mixtral|codestral)/, "mistralai"],
  [/^qwen/, "qwen"],
  [/^deepseek/, "deepseek"],
  [/^grok/, "x-ai"],
];

/** Every vendor this module knows how to strip/prepend (the `/`-prefix set). */
const KNOWN_VENDORS = new Set(["openai", "anthropic", "google", "meta-llama", "mistralai", "qwen", "deepseek", "x-ai", "cohere", "perplexity"]);

/** Detect the OpenRouter vendor for a bare model id, or null when unknown. Pure. */
export function detectVendor(bareId: string): string | null {
  const id = bareId.toLowerCase();
  for (const [re, vendor] of VENDOR_BY_PREFIX) if (re.test(id)) return vendor;
  return null;
}

/** Providers that speak `vendor/model` ids. */
const PREFIXED_PROVIDERS = new Set(["openrouter"]);
/** Providers that want a BARE id (a known-vendor prefix is stripped). */
const BARE_PROVIDERS = new Set(["openai", "anthropic", "gemini", "codex", "openai-codex", "claude-code", "claude-cli"]);

/**
 * Canonicalize `model` for `providerId`. Returns the id unchanged for any
 * provider/id the rules don't cover (freeform backends, unknown vendors,
 * already-correct shapes). Pure.
 */
export function normalizeModelForProvider(providerId: string, model: string | undefined): string | undefined {
  if (!model) return model;
  const id = providerId.toLowerCase();
  const hasSlash = model.includes("/");

  if (PREFIXED_PROVIDERS.has(id)) {
    if (hasSlash) return model; // already vendor/model
    const vendor = detectVendor(model);
    return vendor ? `${vendor}/${model}` : model;
  }

  if (BARE_PROVIDERS.has(id) && hasSlash) {
    const [prefix, ...rest] = model.split("/");
    // Only strip a KNOWN vendor prefix — never a freeform namespace we don't recognize.
    return KNOWN_VENDORS.has((prefix ?? "").toLowerCase()) ? rest.join("/") : model;
  }

  return model;
}
