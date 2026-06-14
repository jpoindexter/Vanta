import type { ReactElement } from "react";
import { App } from "../app.js";
import { MissionControlFrame } from "./mission-control.js";
import type { RunSetup } from "../../session.js";

export function AppV2(props: { setup: RunSetup; repoRoot: string }): ReactElement {
  const provider = props.setup.provider;
  return (
    <MissionControlFrame
      model={provider.modelId()}
      visionModel={process.env.VANTA_VISION_MODEL}
      repoRoot={props.repoRoot}
      contextUsed={0}
      contextWindow={provider.contextWindow()}
      goal={null}
      safetyVerdict="ALLOW"
      telemetry={{ tokens: 0, costUsd: 0, elapsed: "0s" }}
    >
      <App setup={props.setup} repoRoot={props.repoRoot} />
    </MissionControlFrame>
  );
}
