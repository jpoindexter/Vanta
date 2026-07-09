import { resolveExecBackend } from "../exec/backend.js";
import { parseEgressPolicy } from "../net/egress-policy.js";

type EgressNetwork = {
  dockerBackend: boolean;
  dockerNetwork: "none" | "host";
  appAllow: string[];
  appDeny: string[];
};

function csv(items: string[]): string {
  return items.length ? items.join(", ") : "(empty)";
}

export function inspectEgress(env: NodeJS.ProcessEnv): EgressNetwork {
  const policy = parseEgressPolicy(env);
  return {
    dockerBackend: resolveExecBackend(env) === "docker",
    dockerNetwork: env.VANTA_SANDBOX_NET === "1" ? "host" : "none",
    appAllow: policy.allow,
    appDeny: policy.deny,
  };
}

function dockerLine(plan: EgressNetwork): string {
  const backend = plan.dockerBackend ? "on" : "off";
  const net = plan.dockerNetwork === "none" ? "--network none" : "network allowed";
  return `  docker backend: ${backend} · ${net}`;
}

export function formatEgress(plan: EgressNetwork): string {
  const lines = [
    "Egress isolation",
    dockerLine(plan),
    `  HTTP allowlist: ${csv(plan.appAllow)}`,
    `  HTTP denylist:  ${csv(plan.appDeny)}`,
  ];
  if (plan.dockerNetwork === "none") {
    lines.push("  launch: VANTA_EXEC_BACKEND=docker VANTA_SANDBOX_NET=0 vanta run \"<task>\"");
  } else if (plan.appAllow.length) {
    lines.push("  warning: domain allowlists are enforced by Vanta's HTTP guard, not Docker; use --network none for hard no-egress runs.");
  }
  return lines.join("\n");
}

export function runEgressCommand(rest: string[], env: NodeJS.ProcessEnv = process.env, log = console.log): number {
  const sub = rest[0] ?? "status";
  if (sub !== "status" && sub !== "plan") {
    log("usage: vanta egress [status|plan]");
    return 1;
  }
  log(formatEgress(inspectEgress(env)));
  return 0;
}
