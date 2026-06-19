import { spawn } from "node:child_process";
import { loadSettings } from "../settings/store.js";
import { resolveSshProfile, buildSshArgs, profileNames, type SshProfile } from "../ssh/config.js";

// `vanta ssh <name>` — open an interactive shell to a configured host. The host
// comes from settings.sshConfigs; the kernel is not in this path (it's a plain
// interactive shell the operator drives), so it stays a thin launcher.

export type SshSpawn = (cmd: string, args: string[]) => Promise<number>;
export type LoadSettings = (root: string, env: NodeJS.ProcessEnv) => Promise<{ sshConfigs?: SshProfile[] }>;

const defaultSpawn: SshSpawn = (cmd, args) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(127));
  });

export async function runSshCommand(
  root: string,
  rest: string[],
  deps: { spawn?: SshSpawn; loadSettings?: LoadSettings } = {},
): Promise<number> {
  const settings = await (deps.loadSettings ?? loadSettings)(root, process.env);
  const profiles = settings.sshConfigs;
  const names = profileNames(profiles);
  const name = rest[0];
  if (!name) {
    console.error(names.length ? `usage: vanta ssh <name>\nconfigured: ${names.join(", ")}` : "no SSH profiles configured — add them to settings.sshConfigs");
    return 1;
  }
  const profile = resolveSshProfile(name, profiles);
  if (!profile) {
    console.error(`unknown ssh profile: ${name}${names.length ? ` (configured: ${names.join(", ")})` : ""}`);
    return 1;
  }
  return (deps.spawn ?? defaultSpawn)("ssh", buildSshArgs(profile));
}
