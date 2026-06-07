import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { oneLine } from "./format.js";
import type { Message } from "../types.js";
import type { SlashHandler } from "./types.js";

// BUG-CAPTURE — turn a live annoyance into a structured record with the context
// you'd otherwise have to reconstruct: when, session, model/provider, the last
// intent, recent tool calls, and git state. Writes to .vanta/bugs/ so it's
// durable + greppable; promote to a roadmap card later with roadmap_add.

export type BugContext = {
  description: string;
  when: string;
  sessionId: string;
  provider: string;
  model: string;
  lastIntent: string;
  recentTools: string[];
  git: string;
};

/** Render a structured bug record. Pure — the testable core of /bug. */
export function formatBugRecord(c: BugContext): string {
  return [
    `# Bug: ${oneLine(c.description, 70)}`,
    "",
    `- When: ${c.when}`,
    `- Session: ${c.sessionId}`,
    `- Model: ${c.provider}/${c.model}`,
    `- Git: ${c.git}`,
    "",
    "## What happened",
    c.description,
    "",
    "## Last intent",
    c.lastIntent || "(none captured)",
    "",
    "## Recent tool calls",
    c.recentTools.length ? c.recentTools.map((t) => `- ${t}`).join("\n") : "(none)",
    "",
    "## Repro / notes",
    "(fill in the steps to reproduce)",
    "",
  ].join("\n");
}

/** Last N tool-call names from the transcript, oldest→newest. */
export function recentToolNames(messages: Message[], n = 8): string[] {
  return messages.filter((m) => m.role === "tool").map((m) => m.name ?? "?").slice(-n);
}

function lastUserText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "user") return oneLine(m.content, 120);
  }
  return "";
}

async function captureGit(repoRoot: string): Promise<string> {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const [{ stdout: branch }, { stdout: status }] = await Promise.all([
      run("git", ["-C", repoRoot, "rev-parse", "--abbrev-ref", "HEAD"]),
      run("git", ["-C", repoRoot, "status", "--short"]),
    ]);
    const dirty = status.trim().split("\n").filter(Boolean).length;
    return `${branch.trim()} (${dirty} uncommitted file${dirty === 1 ? "" : "s"})`;
  } catch {
    return "unknown";
  }
}

export const bug: SlashHandler = async (arg, ctx) => {
  const description = arg.trim();
  if (!description) return { output: "  usage: /bug <what happened>" };
  const repoRoot = dirname(ctx.dataDir);
  const record = formatBugRecord({
    description,
    when: ctx.now().toISOString(),
    sessionId: ctx.state.sessionId,
    provider: ctx.env.VANTA_PROVIDER ?? "unknown",
    model: ctx.setup.provider.modelId(),
    lastIntent: lastUserText(ctx.convo.messages),
    recentTools: recentToolNames(ctx.convo.messages),
    git: await captureGit(repoRoot),
  });
  const dir = join(ctx.dataDir, "bugs");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `bug-${ctx.state.sessionId}-${ctx.now().getTime()}.md`);
  await writeFile(file, record, "utf8");
  return { output: `  🐞 bug recorded → ${file}\n  · promote it to a card with roadmap_add when you triage` };
};
