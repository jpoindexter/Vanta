// `vanta control [setup|doctor]` — make Vanta's NATIVE desktop control work
// out of the box (the chicago-mcp rock, without an external MCP server). Vanta
// already ships vision_action (screencapture → vision grounding → cliclick); this
// command grants the OS permissions + checks the one external helper (cliclick),
// so "Vanta can drive my screen" is part of the build, not a separate program.
// Routing through an external computer-use MCP (VANTA_CHICAGO_MCP) stays an
// optional power-user upgrade on top of this native path.

import { execFileSync } from "node:child_process";
import { openPrivacyPane } from "../platform/macos-prefs.js";

/** Sync command runner returning stdout (throws if the tool is absent). */
export type CmdRunner = (cmd: string, args: string[]) => string;

const realRun: CmdRunner = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", timeout: 5000 });

/** Whether `tool` is on PATH. Never throws. */
export function toolPresent(run: CmdRunner, tool: string): boolean {
  try {
    run("which", [tool]);
    return true;
  } catch {
    return false;
  }
}

/** Readiness of the native desktop-control substrate. */
export type DesktopDoctor = {
  os: NodeJS.Platform;
  screencapture: boolean;
  cliclick: boolean;
  ready: boolean;
  notes: string[];
};

/** Probe the native desktop-control deps (screencapture + cliclick). Pure-ish. */
export function desktopControlDoctor(run: CmdRunner = realRun, platform: NodeJS.Platform = process.platform): DesktopDoctor {
  const screencapture = platform === "darwin" && toolPresent(run, "screencapture");
  const cliclick = toolPresent(run, "cliclick");
  const notes: string[] = [];
  if (platform !== "darwin") notes.push("Native desktop control is macOS-only right now.");
  if (!cliclick) notes.push("cliclick missing — install the click helper: brew install cliclick");
  if (platform === "darwin") notes.push("Grant Screen Recording + Accessibility to your terminal (run `vanta control` to open both panes).");
  return { os: platform, screencapture, cliclick, ready: screencapture && cliclick, notes };
}

/** Render the doctor report. */
export function formatDoctor(d: DesktopDoctor): string {
  const yn = (b: boolean): string => (b ? "✓" : "✗");
  return [
    "Desktop control (native vision_action — screencapture → ground → cliclick):",
    `  ${yn(d.screencapture)} screencapture  (built-in macOS screen capture)`,
    `  ${yn(d.cliclick)} cliclick       (mouse + keyboard actuation)`,
    `  ${d.ready ? "✓ READY — Vanta can see your screen and click/type on it" : "✗ not ready yet"}`,
    ...d.notes.map((n) => `  • ${n}`),
  ].join("\n");
}

/** Injected seams for {@link runControlCommand}. */
export type ControlDeps = { log?: (l: string) => void; run?: CmdRunner; openPane?: typeof openPrivacyPane };

/**
 * `vanta control` (default `setup`) opens the Screen Recording + Accessibility
 * panes and reports readiness; `vanta control doctor` just reports. Exit 0 when
 * ready (doctor) / always 0 for setup (panes opened).
 */
export async function runControlCommand(repoRoot: string, rest: string[], deps: ControlDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  const d = desktopControlDoctor(deps.run ?? realRun);
  if ((rest[0] ?? "setup") === "doctor") {
    log(formatDoctor(d));
    return d.ready ? 0 : 1;
  }
  const openPane = deps.openPane ?? openPrivacyPane;
  log(openPane("screen-recording").message);
  log(openPane("accessibility").message);
  if (!d.cliclick) log("Then install the click helper:  brew install cliclick");
  log("");
  log(formatDoctor(d));
  return 0;
}
