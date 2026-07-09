import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFileRaw = promisify(execFileCb);

export type ActiveContext = {
  source: "macos-frontmost" | "cwd-only";
  cwd: string;
  app?: string;
  window?: string;
  context: string;
  error?: string;
};

export type ActiveContextDeps = {
  platform?: NodeJS.Platform;
  cwd?: () => string;
  execFile?: (file: string, args: string[], opts: { timeout: number }) => Promise<{ stdout: string; stderr?: string }>;
};

export const MAC_FRONTMOST_SCRIPT = `
tell application "System Events"
  set frontAppProcess to first application process whose frontmost is true
  set frontApp to name of frontAppProcess
  set winTitle to ""
  try
    set winTitle to name of front window of frontAppProcess
  end try
end tell
return frontApp & "\\n" & winTitle
`.trim();

export function parseMacFrontmost(stdout: string, cwd: string): ActiveContext {
  const [appRaw = "", windowRaw = ""] = stdout.split(/\r?\n/);
  const app = appRaw.trim() || "unknown app";
  const window = windowRaw.trim();
  return {
    source: "macos-frontmost",
    cwd,
    app,
    window: window || undefined,
    context: buildContext({ cwd, app, window: window || undefined }),
  };
}

export async function collectActiveContext(deps: ActiveContextDeps = {}): Promise<ActiveContext> {
  const platform = deps.platform ?? process.platform;
  const cwd = deps.cwd?.() ?? process.cwd();
  if (platform !== "darwin") return cwdOnly(cwd, "active-window capture is only implemented on macOS");
  try {
    const run = deps.execFile ?? runExecFile;
    const { stdout } = await run("osascript", ["-e", MAC_FRONTMOST_SCRIPT], { timeout: 2_000 });
    return parseMacFrontmost(stdout, cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return cwdOnly(cwd, message);
  }
}

async function runExecFile(file: string, args: string[], opts: { timeout: number }): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileRaw(file, args, { timeout: opts.timeout, encoding: "utf8" });
  return { stdout: String(stdout), stderr: String(stderr ?? "") };
}

function cwdOnly(cwd: string, error: string): ActiveContext {
  return {
    source: "cwd-only",
    cwd,
    context: buildContext({ cwd }),
    error,
  };
}

function buildContext(input: { cwd: string; app?: string; window?: string }): string {
  return [
    input.app ? `active app: ${input.app}` : "active app: unknown",
    input.window ? `active window: ${input.window}` : "active window: unknown",
    `repo: ${input.cwd}`,
  ].join("\n");
}
