// INSTALL-PARITY — dependency preflight: detect every tool a new user needs and
// emit the exact one-command fix per platform, so "install → working session" is
// one command + one setup step (parity with best-in-class one-line installers).
// Pure core (runPreflight over an injected probe) + a real `commandExists` adapter.
import { spawnSync } from "node:child_process";

export type Platform = "macos" | "linux" | "termux" | "other";

export interface ToolSpec {
  /** Display name. */
  name: string;
  /** Executable probed on PATH. */
  cmd: string;
  /** Hard requirement (blocks a working session) vs recommended (enables a capability). */
  required: boolean;
  /** One line: what it unlocks. */
  purpose: string;
  brew?: string;
  apt?: string;
  termux?: string;
  platforms?: Platform[];
  /** Manual install URL when there's no package (e.g. rustup). */
  url?: string;
}

// The tools a fresh machine needs. Required = can't run without it; recommended =
// turns on an opt-in capability (voice / desktop / swarm), degraded-without.
export const PREFLIGHT_TOOLS: ToolSpec[] = [
  { name: "Node.js 22+", cmd: "node", required: true, purpose: "the agent runtime", brew: "node", termux: "nodejs-lts", url: "https://nodejs.org" },
  { name: "Rust (cargo)", cmd: "cargo", required: true, purpose: "the safety kernel", termux: "rust", url: "https://rustup.rs" },
  { name: "git", cmd: "git", required: true, purpose: "source + skill versioning", brew: "git", apt: "git", termux: "git" },
  { name: "ripgrep", cmd: "rg", required: false, purpose: "fast code search", brew: "ripgrep", apt: "ripgrep", termux: "ripgrep" },
  { name: "ffmpeg", cmd: "ffmpeg", required: false, purpose: "voice input capture", brew: "ffmpeg", apt: "ffmpeg", termux: "ffmpeg" },
  { name: "whisper", cmd: "whisper", required: false, purpose: "local speech-to-text", brew: "openai-whisper", url: "https://github.com/openai/whisper" },
  { name: "cliclick", cmd: "cliclick", required: false, purpose: "native desktop control", brew: "cliclick", platforms: ["macos"] },
  { name: "tmux", cmd: "tmux", required: false, purpose: "terminal capture + swarm", brew: "tmux", apt: "tmux", termux: "tmux" },
];

export function detectPlatform(p: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): Platform {
  if (p === "linux" && (env.TERMUX_VERSION || env.PREFIX?.includes("com.termux"))) return "termux";
  if (p === "darwin") return "macos";
  if (p === "linux") return "linux";
  return "other";
}

/** The exact command to install one tool on a platform, or a manual pointer. */
export function installCommand(tool: ToolSpec, platform: Platform): string | null {
  if (platform === "macos" && tool.brew) return `brew install ${tool.brew}`;
  if (platform === "linux" && tool.apt) return `sudo apt-get install -y ${tool.apt}`;
  if (platform === "termux") return tool.termux ? `pkg install -y ${tool.termux}` : tool.url ?? null;
  if (tool.url) return tool.url;
  if (tool.brew) return `brew install ${tool.brew}`;
  return null;
}

export interface PreflightResult {
  ok: boolean; // all REQUIRED tools present
  present: string[];
  missingRequired: ToolSpec[];
  missingRecommended: ToolSpec[];
}

/** Pure: partition tools into present / missing-required / missing-recommended. */
export function runPreflight(
  has: (cmd: string) => boolean,
  tools: ToolSpec[] = PREFLIGHT_TOOLS,
  platform?: Platform,
): PreflightResult {
  const present: string[] = [];
  const missingRequired: ToolSpec[] = [];
  const missingRecommended: ToolSpec[] = [];
  for (const t of tools) {
    if (platform && t.platforms && !t.platforms.includes(platform)) continue;
    if (has(t.cmd)) present.push(t.cmd);
    else if (t.required) missingRequired.push(t);
    else missingRecommended.push(t);
  }
  return { ok: missingRequired.length === 0, present, missingRequired, missingRecommended };
}

/** Human-readable report with the exact fix per missing tool. */
export function formatPreflight(res: PreflightResult, platform: Platform): string {
  const lines: string[] = [];
  const line = (t: ToolSpec, mark: string) => {
    const fix = installCommand(t, platform);
    return `  ${mark} ${t.name} — ${t.purpose}${fix ? `\n      ↳ ${fix}` : ""}`;
  };
  if (res.ok) lines.push("✓ All required tools present.");
  else {
    lines.push("✗ Missing required tools (install these first):");
    for (const t of res.missingRequired) lines.push(line(t, "✗"));
  }
  if (res.missingRecommended.length) {
    lines.push("", "Optional — enables more capabilities:");
    for (const t of res.missingRecommended) lines.push(line(t, "○"));
  }
  return lines.join("\n");
}

/** Real probe: is `cmd` on PATH? Uses the shell's `command -v` (portable). */
export function commandExists(cmd: string): boolean {
  // Guard the arg so a hostile cmd can't break out of `command -v`.
  if (!/^[\w.-]+$/.test(cmd)) return false;
  const r = spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" });
  return r.status === 0;
}
