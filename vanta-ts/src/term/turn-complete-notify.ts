import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { notify as realNotify } from "./notify.js";

const execFile = promisify(execFileCb);

export type TurnCompleteNotifyInput = {
  prompt: string;
  finalText: string;
  env: NodeJS.ProcessEnv;
  dataDir?: string;
  cwd?: string;
};

export type TurnCompleteNotifyDeps = {
  notify?: typeof realNotify;
  windowFocused?: () => boolean | Promise<boolean>;
};

function enabled(env: NodeJS.ProcessEnv): boolean {
  const value = env.VANTA_NOTIFY_UNFOCUSED?.trim().toLowerCase();
  return value === "1" || value === "true";
}

function focusOverride(env: NodeJS.ProcessEnv): boolean | null {
  const value = env.VANTA_WINDOW_FOCUSED?.trim().toLowerCase();
  if (!value) return null;
  if (["1", "true", "focused", "yes"].includes(value)) return true;
  if (["0", "false", "unfocused", "no"].includes(value)) return false;
  return null;
}

function expectedAppNames(env: NodeJS.ProcessEnv): Set<string> {
  const names = new Set((env.VANTA_TERMINAL_APP_NAMES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const term = env.TERM_PROGRAM;
  if (term === "Apple_Terminal") names.add("Terminal");
  if (term === "iTerm.app") names.add("iTerm2");
  if (term === "WezTerm") names.add("WezTerm");
  if (term === "vscode") {
    names.add("Visual Studio Code");
    names.add("Cursor");
  }
  return names;
}

async function macTerminalFocused(env: NodeJS.ProcessEnv): Promise<boolean> {
  if (process.platform !== "darwin") return true;
  const names = expectedAppNames(env);
  if (!names.size) return true;
  try {
    const { stdout } = await execFile("osascript", [
      "-e",
      'tell application "System Events" to get name of first application process whose frontmost is true',
    ]);
    return names.has(stdout.trim());
  } catch {
    return true;
  }
}

export async function isWindowFocused(env: NodeJS.ProcessEnv, deps: Pick<TurnCompleteNotifyDeps, "windowFocused"> = {}): Promise<boolean> {
  const override = focusOverride(env);
  if (override !== null) return override;
  if (deps.windowFocused) {
    try {
      return await deps.windowFocused();
    } catch {
      return true;
    }
  }
  return macTerminalFocused(env);
}

export function buildTurnCompleteNotice(prompt: string): { title: string; message: string } {
  const label = prompt.trim().replace(/\s+/g, " ");
  return {
    title: "Vanta finished",
    message: label ? `Turn complete: ${label.slice(0, 80)}` : "Turn complete",
  };
}

export async function maybeNotifyTurnComplete(input: TurnCompleteNotifyInput, deps: TurnCompleteNotifyDeps = {}): Promise<boolean> {
  if (!enabled(input.env)) return false;
  if (!input.finalText.trim()) return false;
  if (await isWindowFocused(input.env, deps)) return false;
  const send = deps.notify ?? realNotify;
  const notice = buildTurnCompleteNotice(input.prompt);
  send({
    title: notice.title,
    message: notice.message,
    env: { ...input.env, VANTA_NOTIFY: "1" },
    dataDir: input.dataDir,
    cwd: input.cwd,
    notificationType: "turn_complete",
  });
  return true;
}
