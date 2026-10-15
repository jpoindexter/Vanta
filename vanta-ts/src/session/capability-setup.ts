import type { KernelClient } from "../kernel/client.js";
import { buildRegistry } from "../tools/index.js";
import { resolveRoutedProvider } from "../routing/model-router.js";
import { buildFallbackChain } from "../providers/fallback.js";
import { wrapCredentialPool } from "../credentials/resolve.js";
import { resolvePermissionMode } from "../modes/permission-mode.js";
import { applyLocalRuntimeLimits, resolveSessionToolInclude } from "./local-runtime-policy.js";
import { loadRuntimeExtensions, loadRuntimeSettings } from "./runtime-extensions.js";
import type { TrustConfirmer } from "../settings/trust-gate.js";

/** Shared post-policy registry assembly. No model call or prompt/InstructionsLoaded hooks. */
export async function prepareSessionCapabilities(
  repoRoot: string,
  safety: KernelClient,
  options: { instruction?: string; confirmTrust?: TrustConfirmer } = {},
) {
  const settings = await loadRuntimeSettings(repoRoot);
  const routed = resolveRoutedProvider(process.env, options.instruction ?? "interactive session");
  const owner = process.env.VANTA_SECRET_SCOPE ?? (process.env.VANTA_PROFILE ? `profile:${process.env.VANTA_PROFILE}` : "interactive");
  const provider = applyLocalRuntimeLimits(buildFallbackChain(wrapCredentialPool(routed, process.env, owner), process.env), process.env);
  const include = resolveSessionToolInclude(settings.allowedTools, provider.routeInfo?.(), process.env);
  const registry = buildRegistry({ exclude: settings.blockedTools ?? [], include });
  const extensions = await loadRuntimeExtensions(repoRoot, registry,
    { root: repoRoot, confirm: options.confirmTrust }, { settings, effectGate: {
      kernel: safety, projectRoot: repoRoot, sessionId: `runtime-extensions:${process.pid}`,
      permissionMode: resolvePermissionMode(process.env),
    } });
  return { provider, registry, ...extensions };
}
