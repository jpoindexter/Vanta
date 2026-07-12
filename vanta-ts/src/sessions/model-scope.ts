import type { LLMProvider } from "../providers/interface.js";
import { resolveProvider } from "../providers/index.js";

export type SessionModel = { providerId?: string; modelId?: string };

export function providerIdFor(provider: LLMProvider, env: NodeJS.ProcessEnv): string {
  return provider.routeInfo?.().provider ?? env.VANTA_PROVIDER ?? "openai";
}

/** Resolve a saved session override without mutating process.env or the default .env. */
export function resolveSessionModel(selection: SessionModel, env: NodeJS.ProcessEnv): LLMProvider | null {
  if (!selection.providerId || !selection.modelId) return null;
  return resolveProvider({ ...env, VANTA_PROVIDER: selection.providerId, VANTA_MODEL: selection.modelId });
}
