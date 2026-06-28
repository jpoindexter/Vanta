import { buildAgentImage, autonomousPreflight, AUTONOMOUS_IMAGE_DEFAULT } from "../agents/autonomous-preflight.js";

/**
 * `vanta agent-image [build]` — build (or check readiness of) the Docker image used by
 * `call_agent(autonomous:true)` to run a boxed agent. Makes the autonomous box one command to set up
 * on any machine, instead of a hand-rolled `docker build`.
 */
export function runAgentImageCommand(rest: string[]): number {
  const image = process.env.VANTA_AGENT_DOCKER_IMAGE ?? AUTONOMOUS_IMAGE_DEFAULT;
  if (rest[0] === "build") {
    console.log(`Building the autonomous-agent image "${image}" (Node + git + claude CLI — first run downloads ~600MB)…`);
    const r = buildAgentImage(image);
    console.log(r.ok ? `✓ built ${image}. call_agent(autonomous:true) is ready.` : "✗ build failed — is Docker installed and running?");
    return r.ok ? 0 : 1;
  }
  const pf = autonomousPreflight(image);
  console.log(pf.ready ? `✓ autonomous box ready (image ${image}).` : `✗ ${pf.reason}. ${pf.hint}`);
  return pf.ready ? 0 : 1;
}
