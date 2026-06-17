import { CodegraphProvider } from "./codegraph.js";
import { NullCodeIntelProvider } from "./null.js";
import type { CodeIntelProvider } from "./interface.js";

/**
 * Resolve the active code-intelligence engine from environment.
 *   VANTA_CODE_INTEL=auto      → codegraph if installed, else degrades (default)
 *   VANTA_CODE_INTEL=codegraph → force the codegraph adapter
 *   VANTA_CODE_INTEL=off       → null adapter (feature disabled, no-op)
 *
 * To add a new engine: implement {@link CodeIntelProvider} and add one case
 * here. No consumer (tools/factory/core) changes — they depend only on the port.
 */
export function resolveCodeIntelProvider(env: NodeJS.ProcessEnv): CodeIntelProvider {
  const mode = (env.VANTA_CODE_INTEL ?? "auto").toLowerCase();
  switch (mode) {
    case "off":
      return new NullCodeIntelProvider();
    case "auto":
    case "codegraph":
      return new CodegraphProvider();
    default:
      throw new Error(
        `Unknown VANTA_CODE_INTEL "${mode}". Use auto, codegraph, or off.`,
      );
  }
}

export type {
  CodeIntelProvider,
  CodeSymbolKind,
  CodeContextOptions,
  CodeSearchOptions,
  CodeIndexOptions,
  CodeIntelScope,
} from "./interface.js";
