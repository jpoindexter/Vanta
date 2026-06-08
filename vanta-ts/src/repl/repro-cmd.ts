import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { Goal, Message } from "../types.js";
import type { SlashHandler } from "./types.js";

// REPRO-PACK — bundle the current session's context into a shareable diagnostic
// snapshot. Collects enough signal to reproduce a failure without exposing secrets.
// Writes to .vanta/repro-<timestamp>.md so every repro is durable and greppable.

type ReproData = {
  when: string;
  sessionId: string;
  provider: string;
  model: string;
  nodeVersion: string;
  envFlags: string[];
  goals: Goal[];
  tasks: string[];
  lastUserMessages: string[];
  lastAssistantMessages: string[];
  gitStatus: string;
  gitLog: string;
};

// ─── secret masking ───────────────────────────────────────────────────────────

const SECRET_PATTERN = /KEY|SECRET|TOKEN|PASSWORD/i;

/** True if the env var name looks like it holds a secret. */
export function isSecretKey(name: string): boolean {
  return SECRET_PATTERN.test(name);
}

/** Mask a value that looks like a secret (long opaque string). Exported for testing. */
export function maskValue(name: string, value: string): string {
  if (!isSecretKey(name)) return value;
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)} (masked)`;
}

// ─── git helpers ──────────────────────────────────────────────────────────────

async function captureGitStatus(repoRoot: string): Promise<string> {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { stdout } = await promisify(execFile)("git", ["-C", repoRoot, "status", "--short"]);
    return stdout.trim() || "(clean)";
  } catch {
    return "(git unavailable)";
  }
}

async function captureGitLog(repoRoot: string): Promise<string> {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { stdout } = await promisify(execFile)("git", ["-C", repoRoot, "log", "--oneline", "-5"]);
    return stdout.trim() || "(no commits)";
  } catch {
    return "(git unavailable)";
  }
}

// ─── message helpers ──────────────────────────────────────────────────────────

function lastNByRole(messages: Message[], role: "user" | "assistant", n: number): string[] {
  return messages
    .filter((m) => m.role === role && "content" in m && m.content.trim())
    .slice(-n)
    .map((m) => ("content" in m ? m.content.slice(0, 300) : ""));
}

// ─── pure formatter ───────────────────────────────────────────────────────────

/** Render a repro bundle to markdown. Pure — the testable core of /repro. */
export function formatReproBundle(d: ReproData): string {
  const goalLines = d.goals.length
    ? d.goals.filter((g) => g.status === "active").map((g) => `  - [${g.id}] ${g.text}`).join("\n")
    : "  (none)";

  const taskLines = d.tasks.length ? d.tasks.map((t) => `  - ${t}`).join("\n") : "  (none)";

  const userLines = d.lastUserMessages.length
    ? d.lastUserMessages.map((m, i) => `### User [-${d.lastUserMessages.length - i}]\n${m}`).join("\n\n")
    : "(none)";

  const assistantLines = d.lastAssistantMessages.length
    ? d.lastAssistantMessages.map((m, i) => `### Assistant [-${d.lastAssistantMessages.length - i}]\n${m}`).join("\n\n")
    : "(none)";

  const envBlock = d.envFlags.length ? d.envFlags.join("\n") : "  (none)";

  return [
    `# Vanta Repro Bundle`,
    ``,
    `- When: ${d.when}`,
    `- Session: ${d.sessionId}`,
    `- Model: ${d.provider}/${d.model}`,
    `- Node: ${d.nodeVersion}`,
    ``,
    `## Active Goals`,
    goalLines,
    ``,
    `## Active Tasks`,
    taskLines,
    ``,
    `## Git Status`,
    "```",
    d.gitStatus,
    "```",
    ``,
    `## Git Log (last 5)`,
    "```",
    d.gitLog,
    "```",
    ``,
    `## Last 3 User Messages`,
    userLines,
    ``,
    `## Last 3 Assistant Messages`,
    assistantLines,
    ``,
    `## Vanta Env Flags`,
    "```",
    envBlock,
    "```",
    ``,
  ].join("\n");
}

// ─── handler ──────────────────────────────────────────────────────────────────

/** Collect VANTA_* env vars, masking secrets. */
function collectEnvFlags(env: NodeJS.ProcessEnv): string[] {
  return Object.entries(env)
    .filter(([k]) => k.startsWith("VANTA_"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${maskValue(k, v ?? "")}`);
}

export const repro: SlashHandler = async (_arg, ctx) => {
  const { dirname } = await import("node:path");
  const { readStack } = await import("../task-stack/store.js");

  const repoRoot = dirname(ctx.dataDir);
  const now = ctx.now();
  const ts = now.getTime();

  const [goals, stack, gitStatus, gitLog] = await Promise.all([
    ctx.setup.safety.getGoals().catch(() => [] as Goal[]),
    readStack(ctx.dataDir).catch(() => ({ tasks: [] as import("../task-stack/types.js").OperatorTask[] })),
    captureGitStatus(repoRoot),
    captureGitLog(repoRoot),
  ]);

  const activeTasks = stack.tasks
    .filter((t) => t.status === "active" || t.status === "pending")
    .map((t) => `[${t.status}] ${t.title}`);

  const data: ReproData = {
    when: now.toISOString(),
    sessionId: ctx.state.sessionId,
    provider: ctx.env.VANTA_PROVIDER ?? "unknown",
    model: ctx.setup.provider.modelId(),
    nodeVersion: process.version,
    envFlags: collectEnvFlags(ctx.env),
    goals,
    tasks: activeTasks,
    lastUserMessages: lastNByRole(ctx.convo.messages, "user", 3),
    lastAssistantMessages: lastNByRole(ctx.convo.messages, "assistant", 3),
    gitStatus,
    gitLog,
  };

  const content = formatReproBundle(data);
  const filename = `repro-${ts}.md`;
  await mkdir(ctx.dataDir, { recursive: true });
  await writeFile(join(ctx.dataDir, filename), content, "utf8");

  return { output: `  · repro saved to .vanta/${filename}` };
};
