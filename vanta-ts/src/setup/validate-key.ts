/**
 * OP-SETUP-FIELD-VALIDATE — per-field API-key shape validation for the setup
 * wizard. Catches the two common paste mistakes with a specific message + a
 * where-to-find hint, BEFORE the key is written:
 *   1. wrong vendor  — an `xoxb-…` Slack token pasted for OpenAI, `sk-ant-…`
 *      for OpenAI, etc. (high confidence — the key matches a KNOWN vendor shape
 *      that isn't the one asked for).
 *   2. malformed     — a provider with a reliable prefix (OpenAI `sk-`, …) got
 *      something that starts with neither its own prefix nor any known vendor.
 *
 * Deliberately CONSERVATIVE: it only enforces providers whose real keys carry a
 * stable, reliable prefix, and passes everything else (Ollama/keyless, custom,
 * routers, OAuth backends) as ok. A valid-but-unusual key is never rejected —
 * a false block would lock a user out of setup, which is worse than a missed
 * catch. Pure, no I/O.
 */

/** Known vendor key shapes, most-specific first so `sk-ant-` beats `sk-`. */
const VENDORS: ReadonlyArray<{ id: string; name: string; re: RegExp }> = [
  { id: "anthropic", name: "Anthropic", re: /^sk-ant-/ },
  { id: "openrouter", name: "OpenRouter", re: /^sk-or-/ },
  { id: "openai", name: "OpenAI", re: /^sk-[A-Za-z0-9]/ },
  { id: "gemini", name: "Google Gemini", re: /^AIza[0-9A-Za-z_-]{10,}/ },
  { id: "slack", name: "Slack", re: /^xox[baprs]-/ },
  { id: "github", name: "GitHub", re: /^gh[posru]_/ },
  { id: "telegram", name: "a Telegram bot", re: /^\d{6,}:[A-Za-z0-9_-]{30,}$/ },
];

/** Providers enforced (reliable prefix). Others are passed through unchecked. */
const EXPECTED: Readonly<Record<string, { prefix: string; label: string }>> = {
  openai: { prefix: "sk-", label: "OpenAI" },
  anthropic: { prefix: "sk-ant-", label: "Anthropic" },
  openrouter: { prefix: "sk-or-", label: "OpenRouter" },
  gemini: { prefix: "AIza", label: "Google Gemini" },
};

/** The known vendor a key's shape belongs to, or null if unrecognized. */
function detectVendor(key: string): { id: string; name: string } | null {
  const hit = VENDORS.find((v) => v.re.test(key));
  return hit ? { id: hit.id, name: hit.name } : null;
}

export type KeyValidation = { ok: true } | { ok: false; message: string; hint?: string };

/**
 * Validate that `key` has the right shape for `providerId`. `hint` (the
 * provider's signup URL) is echoed on failure so the user knows where to get
 * the correct key. Unenforced providers always pass. Pure.
 */
export function validateProviderKey(providerId: string, key: string, hint?: string): KeyValidation {
  const k = key.trim();
  const exp = EXPECTED[providerId];
  if (!exp) return { ok: true };
  if (!k) return { ok: false, message: "The pasted key is empty.", hint };

  const vendor = detectVendor(k);
  if (vendor && vendor.id === providerId) return { ok: true };
  if (vendor) {
    return {
      ok: false,
      message: `This looks like ${vendor.name === "a Telegram bot" ? vendor.name : `a ${vendor.name}`} key, but ${exp.label} keys start with "${exp.prefix}".`,
      hint,
    };
  }
  if (k.startsWith(exp.prefix)) return { ok: true };
  return {
    ok: false,
    message: `This doesn't look like a ${exp.label} key — it should start with "${exp.prefix}".`,
    hint,
  };
}
