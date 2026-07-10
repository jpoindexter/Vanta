import { existsSync } from "node:fs";
import { basename, win32 } from "node:path";

export type ShellInvocation = { cmd: string; args: string[]; kind: "posix" | "powershell" | "cmd" };

export type ShellResolveOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
};

function invocation(shell: string, command: string): ShellInvocation {
  const name = basename(shell.replace(/\\/g, "/")).toLowerCase();
  if (name === "powershell" || name === "powershell.exe" || name === "pwsh" || name === "pwsh.exe") {
    return { cmd: shell, args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], kind: "powershell" };
  }
  if (name === "cmd" || name === "cmd.exe") return { cmd: shell, args: ["/d", "/s", "/c", command], kind: "cmd" };
  return { cmd: shell, args: ["-lc", command], kind: "posix" };
}

function windowsBash(env: NodeJS.ProcessEnv, exists: (path: string) => boolean): string | null {
  for (const dir of (env.PATH ?? "").split(";").filter(Boolean)) {
    const candidate = win32.join(dir.replace(/^"|"$/g, ""), "bash.exe");
    if (exists(candidate)) return candidate;
  }
  for (const candidate of [
    env.ProgramFiles ? win32.join(env.ProgramFiles, "Git", "bin", "bash.exe") : "",
    env.LOCALAPPDATA ? win32.join(env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe") : "",
  ].filter(Boolean)) if (exists(candidate)) return candidate;
  return null;
}

export function resolveShellInvocation(command: string, opts: ShellResolveOptions = {}): ShellInvocation {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  if (env.VANTA_SHELL?.trim()) return invocation(env.VANTA_SHELL.trim(), command);
  if (platform !== "win32") return { cmd: "sh", args: ["-c", command], kind: "posix" };
  const bash = windowsBash(env, opts.exists ?? existsSync);
  return bash ? invocation(bash, command) : invocation("powershell.exe", command);
}
