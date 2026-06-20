import { spawn } from "node:child_process";
import { loadSettings } from "../settings/store.js";
import { resolveSshProfile, resolveSshTarget, buildSshArgs, profileNames, type SshProfile } from "../ssh/config.js";

// `vanta ssh <target>` — two modes:
//   • agent session (default for user@host / host:port, or --agent): opens the
//     interactive agent over SSH. shell tool calls run on the remote host
//     (VANTA_SSH_SESSION); the kernel + permission prompts stay LOCAL.
//   • plain shell (a configured profile name, or --shell): a thin `ssh` launcher
//     the operator drives directly (no kernel in this path).
// In agent mode every remote command is still kernel-assessed by shell_cmd.

export type SshSpawn = (cmd: string, args: string[]) => Promise<number>;
export type LoadSettings = (root: string, env: NodeJS.ProcessEnv) => Promise<{ sshConfigs?: SshProfile[] }>;
export type StartInteractive = (root: string) => Promise<void>;

const defaultSpawn: SshSpawn = (cmd, args) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(127));
  });

// Lazy-imported so this command stays light and free of an import cycle with the
// interactive bootstrap (cli.ts imports both startup.ts and this file).
const defaultStart: StartInteractive = async (root) => {
  const { startInteractive } = await import("./startup.js");
  return startInteractive(root);
};

function parseArgs(rest: string[]): { target?: string; forceShell: boolean; forceAgent: boolean } {
  let forceShell = false;
  let forceAgent = false;
  let target: string | undefined;
  for (const a of rest) {
    if (a === "--shell") forceShell = true;
    else if (a === "--agent") forceAgent = true;
    else if (!target) target = a;
  }
  return { target, forceShell, forceAgent };
}

type SshPlan =
  | { kind: "usage" }
  | { kind: "unknown"; target: string }
  | { kind: "agent"; target: string }
  | { kind: "shell"; profile: SshProfile };

/** Decide what `vanta ssh <args>` should do. A bare configured-profile name
 *  stays the plain shell (back-compat); an explicit user@host (or --agent) opens
 *  the agent session; a bare unconfigured word is unknown (never an implicit dial). Pure. */
function planSsh(rest: string[], profiles: SshProfile[] | undefined): SshPlan {
  const { target, forceShell, forceAgent } = parseArgs(rest);
  if (!target) return { kind: "usage" };
  const profile = resolveSshTarget(target, profiles);
  if (!profile) return { kind: "unknown", target };
  const agent = forceAgent || (!forceShell && resolveSshProfile(target, profiles) === null);
  return agent ? { kind: "agent", target } : { kind: "shell", profile };
}

export async function runSshCommand(
  root: string,
  rest: string[],
  deps: { spawn?: SshSpawn; loadSettings?: LoadSettings; start?: StartInteractive } = {},
): Promise<number> {
  const settings = await (deps.loadSettings ?? loadSettings)(root, process.env);
  const profiles = settings.sshConfigs;
  const plan = planSsh(rest, profiles);
  if (plan.kind === "usage") {
    const names = profileNames(profiles);
    console.error(`usage: vanta ssh <user@host|profile> [--agent|--shell]${names.length ? `\nconfigured profiles: ${names.join(", ")}` : ""}`);
    return 1;
  }
  if (plan.kind === "unknown") {
    const names = profileNames(profiles);
    console.error(`unknown ssh target "${plan.target}"${names.length ? ` (configured: ${names.join(", ")})` : ""} — pass user@host or configure settings.sshConfigs`);
    return 1;
  }
  if (plan.kind === "agent") {
    process.env.VANTA_SSH_SESSION = plan.target;
    await (deps.start ?? defaultStart)(root);
    return 0;
  }
  return (deps.spawn ?? defaultSpawn)("ssh", buildSshArgs(plan.profile));
}
