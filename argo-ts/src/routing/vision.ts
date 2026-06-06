import { resolveProvider } from "../providers/index.js";
import type { LLMProvider } from "../providers/interface.js";

// Vision is an AUXILIARY task: it can — and often must — run on a different model
// than the main agent. When the active model is text-only (DeepSeek V4 Flash, a
// local Ollama text model), routing vision through the active provider silently
// fails ("returned no description"). So image work binds to a dedicated vision
// model, independent of the model the operator is conversing with.

/**
 * Pure: the env that vision/image tasks should resolve their provider from.
 *   VANTA_VISION_MODEL set    → swap VANTA_MODEL to it (and VANTA_PROVIDER too when
 *                              VANTA_VISION_PROVIDER is set, for a model that needs
 *                              a different backend, e.g. gpt-4o-mini on OpenAI).
 *   VANTA_VISION_MODEL unset  → env unchanged — vision uses the active provider,
 *                              preserving prior behavior exactly (opt-in override).
 * Never mutates the input.
 */
export function visionEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const model = env.VANTA_VISION_MODEL;
  if (!model) return env;
  const next: NodeJS.ProcessEnv = { ...env, VANTA_MODEL: model };
  if (env.VANTA_VISION_PROVIDER) next.VANTA_PROVIDER = env.VANTA_VISION_PROVIDER;
  return next;
}

/**
 * Resolve the provider for vision / image auxiliary tasks. See {@link visionEnv}
 * for the routing rule. Use this — not `resolveProvider` directly — in any tool
 * that sends an image to a model, so a non-vision main model never breaks sight.
 */
export function resolveVisionProvider(env: NodeJS.ProcessEnv): LLMProvider {
  return resolveProvider(visionEnv(env));
}
