import { configuredFallbackProviderIds } from "./fallback.js";
import { resolveProvider } from "./index.js";
import { loadUserProviders } from "./user-providers.js";

export type FallbackReadiness = {
  index: number;
  provider: string;
  status: "configuration-resolved" | "unavailable" | "not-checked";
  detail: string;
};

function providerLabel(id: string): string {
  const safe = /^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)
    && !/^(?:sk-|gh[pousr]_|github_pat_|xox[baprs]-|aiza|eyj)/.test(id);
  return safe ? id : "[redacted identifier]";
}

function requiresCredentialStore(id: string, env: NodeJS.ProcessEnv): boolean {
  if (id === "codex" || id === "openai-codex") return true;
  return (id === "claude-code" || id === "claude-cli")
    && !(env.CLAUDE_CODE_OAUTH_TOKEN?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim());
}

/** Configuration only: never send a model request or look up subscription credentials. */
export function inspectFallbackReadiness(env: NodeJS.ProcessEnv): FallbackReadiness[] {
  const userProviders = loadUserProviders(env);
  return configuredFallbackProviderIds(env).map<FallbackReadiness>((entry, index) => {
    const id = entry.toLowerCase();
    const common = { index: index + 1, provider: providerLabel(id) };
    // User-defined providers win over built-ins, matching the real resolver.
    if (!userProviders[id] && requiresCredentialStore(id, env)) {
      return { ...common, status: "not-checked", detail: "Subscription credential lookup disabled; review this route's login separately." };
    }
    try {
      resolveProvider({ ...env, VANTA_PROVIDER: entry });
      return { ...common, status: "configuration-resolved", detail: "Credentials, model and endpoint not verified." };
    } catch {
      return { ...common, status: "unavailable", detail: "Run `vanta setup` and review fallback provider, key and model settings." };
    }
  });
}
