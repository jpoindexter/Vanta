import { useEffect, useMemo, useState, type ReactElement } from "react";
import { App } from "../app.js";
import { MissionControlFrame, type MissionControlFrameProps, type SafetyVerdict } from "./mission-control.js";
import type { RunSetup } from "../../session.js";
import { estimateTokens } from "../../term/tokens.js";
import { formatElapsed } from "../busy.js";
import type { SetupHandoff } from "../../setup/handoff.js";

export type MissionState = Omit<MissionControlFrameProps, "children">;

function activeGoalText(setup: RunSetup): string | null {
  return setup.goals.find((g) => g.status === "active")?.text ?? null;
}

function safetyVerdict(setup: RunSetup): { verdict: SafetyVerdict; reason: string } {
  if (setup.registry.schemas().length === 0) return { verdict: "BLOCK", reason: "no tools loaded" };
  if (!activeGoalText(setup)) return { verdict: "ASK", reason: "no active goal" };
  return { verdict: "ALLOW", reason: "active goal + kernel gate" };
}

export function buildMissionState(
  setup: RunSetup,
  repoRoot: string,
  startedAt: Date,
  now: Date,
): MissionState {
  const provider = setup.provider;
  const goal = activeGoalText(setup);
  const tokens = estimateTokens([{ content: setup.systemPrompt }]);
  const safety = safetyVerdict(setup);
  const toolCount = setup.registry.schemas().length;
  const commandCount = setup.pluginCommands.list().length;
  return {
    model: provider.modelId(),
    visionModel: process.env.VANTA_VISION_MODEL,
    repoRoot,
    contextUsed: tokens,
    contextWindow: provider.contextWindow(),
    goal,
    safetyVerdict: safety.verdict,
    safetyReason: safety.reason,
    workingMemory: [
      goal ? `goal: ${goal}` : "goal: none",
      `scope: ${repoRoot}`,
      `tools: ${toolCount}`,
      `commands: ${commandCount}`,
      setup.ralphContinuity ? "continuity: loaded" : "continuity: empty",
    ],
    telemetry: {
      tokens,
      costUsd: 0,
      elapsed: formatElapsed(Math.max(0, now.getTime() - startedAt.getTime())),
    },
  };
}

export function AppV2(props: { setup: RunSetup; repoRoot: string; onSetupRequest?: (request: SetupHandoff) => void }): ReactElement {
  const startedAt = useMemo(() => new Date(), []);
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const mission = buildMissionState(props.setup, props.repoRoot, startedAt, now);
  return (
    <MissionControlFrame
      {...mission}
    >
      <App setup={props.setup} repoRoot={props.repoRoot} onSetupRequest={props.onSetupRequest} />
    </MissionControlFrame>
  );
}
