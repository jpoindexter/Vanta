import { a2aAutonomousReadiness, formatA2aAutonomousReadiness } from "../agents/autonomous-sandbox-readiness.js";
import type { ExecProbe } from "../agents/autonomous-preflight.js";
import type { AuthReader } from "../agents/autonomous-creds.js";

export function runA2aCommand(
  root: string,
  rest: string[],
  env: NodeJS.ProcessEnv = process.env,
  deps: { probe?: ExecProbe; readAuth?: AuthReader } = {},
): number {
  const [cmd, ...args] = rest;
  if (cmd !== "autonomous-status") {
    console.error("Usage: vanta a2a autonomous-status [--json]");
    return 1;
  }
  const status = a2aAutonomousReadiness({ root, env, probe: deps.probe, readAuth: deps.readAuth });
  if (args.includes("--json")) console.log(JSON.stringify(status, null, 2));
  else console.log(formatA2aAutonomousReadiness(status));
  return status.ready ? 0 : 1;
}
