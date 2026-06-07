import { dirname } from "node:path";
import { oneLine } from "./format.js";
import { recentToolNames } from "./bug-cmd.js";
import type { Goal, Message } from "../types.js";
import type { SlashHandler } from "./types.js";

// HANDOFF-PACKET — a copy-paste state packet for moving work between Vanta, a
// fresh session, or another agent. Assembles the FACTUAL state deterministically
// (no model call): goals, git branch + changed files, recent tools, last intent,
// last result, next-step slot. The durable base AUTO-HANDOFF fires automatically.

export type HandoffContext = {
  when: string;
  sessionId: string;
  provider: string;
  model: string;
  branch: string;
  changedFiles: string;
  goals: Goal[];
  lastIntent: string;
  lastResult: string;
  recentTools: string[];
};

/** Render the copy-paste handoff packet. Pure — the testable core of /handoff. */
export function formatHandoffPacket(c: HandoffContext): string {
  const active = c.goals.filter((g) => g.status === "active");
  const goalLines = active.length ? active.map((g) => `  - [${g.id}] ${g.text}`).join("\n") : "  (none)";
  return [
    `HANDOFF — ${c.when.slice(0, 10)}`,
    `Repo: ${c.branch} · Session: ${c.sessionId} · Model: ${c.provider}/${c.model}`,
    "",
    "GOALS:",
    goalLines,
    "",
    "CHANGED FILES (git status):",
    c.changedFiles.trim() ? c.changedFiles.trim() : "  (clean)",
    "",
    `RECENT TOOL CALLS: ${c.recentTools.length ? c.recentTools.join(", ") : "(none)"}`,
    "",
    `LAST INTENT: ${c.lastIntent || "(none)"}`,
    "",
    "LAST RESULT:",
    c.lastResult ? oneLine(c.lastResult, 400) : "  (none)",
    "",
    "NEXT ACTION: <state the single concrete next step before handing off>",
  ].join("\n");
}

function lastByRole(messages: Message[], role: "user" | "assistant"): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === role && "content" in m && m.content.trim()) return m.content;
  }
  return "";
}

async function captureGit(repoRoot: string): Promise<{ branch: string; changed: string }> {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const [{ stdout: branch }, { stdout: changed }] = await Promise.all([
      run("git", ["-C", repoRoot, "rev-parse", "--abbrev-ref", "HEAD"]),
      run("git", ["-C", repoRoot, "status", "--short"]),
    ]);
    return { branch: branch.trim() || "unknown", changed };
  } catch {
    return { branch: "unknown", changed: "" };
  }
}

export const handoff: SlashHandler = async (_arg, ctx) => {
  const repoRoot = dirname(ctx.dataDir);
  const { branch, changed } = await captureGit(repoRoot);
  const goals = await ctx.setup.safety.getGoals().catch(() => []);
  const packet = formatHandoffPacket({
    when: ctx.now().toISOString(),
    sessionId: ctx.state.sessionId,
    provider: ctx.env.VANTA_PROVIDER ?? "unknown",
    model: ctx.setup.provider.modelId(),
    branch,
    changedFiles: changed,
    goals,
    lastIntent: oneLine(lastByRole(ctx.convo.messages, "user"), 120),
    lastResult: lastByRole(ctx.convo.messages, "assistant"),
    recentTools: recentToolNames(ctx.convo.messages),
  });
  return { output: `\n${packet}\n` };
};
