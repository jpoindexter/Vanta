import { Box, Text } from "ink";
import type { ReactNode, ReactElement } from "react";

export type SafetyVerdict = "ALLOW" | "ASK" | "BLOCK";

export type MissionTelemetry = {
  tokens: number;
  costUsd: number;
  elapsed: string;
};

export type MissionControlFrameProps = {
  model: string;
  visionModel?: string;
  repoRoot: string;
  contextUsed: number;
  contextWindow: number;
  goal: string | null;
  safetyVerdict: SafetyVerdict;
  telemetry: MissionTelemetry;
  children: ReactNode;
};

const pct = (used: number, max: number): number => max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
const compact = (n: number): string => n >= 1_000_000 ? `${Math.round(n / 100_000) / 10}M` : n >= 1_000 ? `${Math.round(n / 100) / 10}k` : String(n);
const oneLine = (s: string, max = 28): string => s.length > max ? `${s.slice(0, max - 1)}…` : s;

export function MissionControlFrame(props: MissionControlFrameProps): ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>Vanta TUI v2</Text>
      <Box>
        <LeftRail {...props} />
        <Box flexDirection="column" flexGrow={1} minWidth={24} paddingX={1}>
          <Text bold>Mission Control</Text>
          <Text dimColor>{props.goal ? oneLine(props.goal, 54) : "No active goal"}</Text>
          <Box marginTop={1} flexDirection="column">{props.children}</Box>
        </Box>
        <RightRail {...props} />
      </Box>
    </Box>
  );
}

function LeftRail(props: MissionControlFrameProps): ReactElement {
  const contextPct = pct(props.contextUsed, props.contextWindow);
  return (
    <Box width={24} flexDirection="column" borderStyle="single" paddingX={1}>
      <Text bold>Durable State</Text>
      <Text>goal {props.goal ? "active" : "none"}</Text>
      <Text>model {oneLine(props.model, 15)}</Text>
      <Text>vision {oneLine(props.visionModel ?? "unset", 14)}</Text>
      <Text>scope {oneLine(props.repoRoot, 15)}</Text>
      <Text>ctx {compact(props.contextUsed)} / {compact(props.contextWindow)}</Text>
      <Text>{contextPct}% load</Text>
    </Box>
  );
}

function RightRail(props: MissionControlFrameProps): ReactElement {
  return (
    <Box width={28} flexDirection="column" borderStyle="single" paddingX={1}>
      <Text bold>Safety Rail</Text>
      <Text>{props.safetyVerdict} current context</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Working Memory</Text>
        <Text>{props.goal ? oneLine(props.goal, 22) : "awaiting goal"}</Text>
      </Box>
      <CommandRiskPanel />
      <Box marginTop={1} flexDirection="column">
        <Text bold>Telemetry</Text>
        <Text>{compact(props.telemetry.tokens)} tokens</Text>
        <Text>${props.telemetry.costUsd.toFixed(2)} · {props.telemetry.elapsed}</Text>
      </Box>
    </Box>
  );
}

function CommandRiskPanel(): ReactElement {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text bold>Command Risks</Text>
      <Text>/status local</Text>
      <Text>/model kernel-gated</Text>
      <Text>/commit approval</Text>
    </Box>
  );
}
