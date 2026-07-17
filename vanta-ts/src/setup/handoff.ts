import { runMessagingSetup } from "../setup-messaging.js";
import { runTtsSetup } from "../setup-tts.js";
import type { Interface as Readline } from "node:readline/promises";

export type SetupHandoff =
  | { section: "messaging"; platformId?: string }
  | { section: "tts" };

export type SetupHandoffDeps = {
  messaging?: typeof runMessagingSetup;
  tts?: typeof runTtsSetup;
  rl?: Readline;
};

export async function runSetupHandoff(
  repoRoot: string,
  request: SetupHandoff,
  deps: SetupHandoffDeps = {},
): Promise<boolean> {
  if (request.section === "messaging") {
    return (deps.messaging ?? runMessagingSetup)(repoRoot, deps.rl, {
      platformId: request.platformId,
    });
  }
  return (deps.tts ?? runTtsSetup)(repoRoot, deps.rl);
}
