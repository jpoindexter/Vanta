import {
  readRegion,
  writeRegion,
  ensureBrain,
  remember,
  recall,
  brainDigest,
  sweep,
  brainHealth,
} from "./brain.js";
import type { Brain } from "./interface.js";

/**
 * The default Brain adapter: the cohesive md-region + structured-entries brain.
 * A thin binding of the existing brain functions to the {@link Brain} port — no
 * behavior change. Swapping the brain = a different adapter in ./index.ts.
 */
export const liveBrain: Brain = {
  id: "live",
  readRegion,
  writeRegion,
  ensureBrain,
  remember,
  recall,
  digest: brainDigest,
  sweep,
  health: brainHealth,
};
