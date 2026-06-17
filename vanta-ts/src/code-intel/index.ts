import { type CodeIntelProvider, nullProvider } from "./provider.js";
import { codegraphProvider } from "./codegraph.js";

// The resolver — the ONE registration point. Pick the active code-intel engine
// (VANTA_CODE_INTEL, default "codegraph"); "none"/"off" returns the no-op
// provider. Adding an engine = one adapter file + one ADAPTERS entry; removing
// codegraph = delete codegraph.ts + this entry, with zero edits to the tools.

const ADAPTERS: Readonly<Record<string, (root: string) => CodeIntelProvider>> = {
  codegraph: codegraphProvider,
};

/** Resolve the code-intel provider for an operating root. */
export function resolveCodeIntel(root: string, env: NodeJS.ProcessEnv = process.env): CodeIntelProvider {
  const id = (env.VANTA_CODE_INTEL ?? "codegraph").toLowerCase();
  if (id === "none" || id === "off") return nullProvider;
  return ADAPTERS[id]?.(root) ?? codegraphProvider(root);
}
