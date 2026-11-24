import { createClaudeCodeRuntime } from "./claude-code.js";
import type { CliDeps } from "./cli-runtime.js";
import { createCodexRuntime } from "./codex.js";
import { createCustomCliRuntime, loadCustomCliEntries } from "./custom-cli.js";
import { createHermesRuntime } from "./hermes.js";
import { createNativeWorkerRuntime, type NativeRuntimeDeps } from "./native.js";
import { createRuntimeRegistry, type RuntimeRegistry } from "./registry.js";

// The registry a company uses: Vanta native (when a live engine port exists),
// Claude Code, Codex, Hermes, and every CLI declared in agents.json.

export type DefaultRegistryDeps = CliDeps & { native?: NativeRuntimeDeps };

export async function createDefaultRegistry(deps: DefaultRegistryDeps): Promise<RuntimeRegistry> {
  const registry = createRuntimeRegistry();
  if (deps.native) registry.register(createNativeWorkerRuntime(deps.native));
  registry.register(createClaudeCodeRuntime(deps));
  registry.register(createCodexRuntime(deps));
  registry.register(createHermesRuntime(deps));
  for (const [id, entry] of await loadCustomCliEntries(deps.env)) registry.register(createCustomCliRuntime(id, entry, deps));
  return registry;
}
