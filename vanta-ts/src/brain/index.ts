import { liveBrain } from "./live.js";
import type { Brain } from "./interface.js";

/**
 * Resolve the active brain from environment.
 *   VANTA_BRAIN=live (default) → the md-region + structured-entries brain
 *
 * To upgrade or swap the brain: implement {@link Brain} and add one case here.
 * No consumer (tools/session/subagent/cli) changes — they depend on the port.
 */
export function resolveBrain(env: NodeJS.ProcessEnv = process.env): Brain {
  const which = (env.VANTA_BRAIN ?? "live").toLowerCase();
  switch (which) {
    case "live":
    case "default":
      return liveBrain;
    default:
      throw new Error(`Unknown VANTA_BRAIN "${which}". Use live (default).`);
  }
}

export type {
  Brain,
  RecallResult,
  RecallOptions,
  WriteRegionOptions,
  BrainHealth,
  BrainEntry,
  UpsertOpts,
} from "./interface.js";
