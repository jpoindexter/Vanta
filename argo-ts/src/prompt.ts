import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Goal } from "./types.js";
import type { ToolSchema } from "./providers/interface.js";

const CONTEXT_FILES = ["ARGO.md", "AGENTS.md", "CLAUDE.md", "README.md"];

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function stableTier(soul: string, root: string, tools: ToolSchema[]): string {
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  return [
    soul.trim(),
    `\nYou operate inside: ${root}`,
    `\nAvailable tools:\n${toolList}`,
    `\nRules — no exceptions:`,
    `1. Before any tool call, state which active goal it serves and what you expect it to return.`,
    `2. After each tool call, verify the output matches your expectation before continuing.`,
    `3. If verification fails, stop and report. Do not continue or fake success.`,
    `4. Never declare a task complete without verified tool output.`,
    `5. Never write outside ${root}.`,
    `6. Never run destructive commands (rm, delete, drop table, reset --hard, sudo).`,
    `When unsure, stop and ask. Fake progress is worse than no progress.`,
  ].join("\n");
}

async function contextTier(root: string): Promise<string> {
  const blocks: string[] = [];
  for (const name of CONTEXT_FILES) {
    const content = await readIfExists(join(root, name));
    if (content) blocks.push(`# ${name}\n${content.trim()}`);
  }
  return blocks.length ? `Project context:\n\n${blocks.join("\n\n")}` : "";
}

function volatileTier(goals: Goal[], now: string, memory?: string): string {
  const active = goals.filter((g) => g.status === "active");
  const goalText = active.length
    ? active.map((g) => `- [${g.id}] ${g.text}`).join("\n")
    : "(no active goals — ask the user what to work toward)";
  const base = `Active goals:\n${goalText}\n\nSession started: ${now}`;
  return memory?.trim()
    ? `${base}\n\nRecent memory toward your goals:\n${memory}`
    : base;
}

/** Build the three-tier system prompt: stable + context + volatile. */
export async function buildSystemPrompt(opts: {
  root: string;
  soulPath: string;
  goals: Goal[];
  tools: ToolSchema[];
  now: string;
  memory?: string;
}): Promise<string> {
  const soul =
    (await readIfExists(opts.soulPath)) ??
    "# Argo\nI am Argo, a trusted operator agent.";
  const tiers = [
    stableTier(soul, opts.root, opts.tools),
    await contextTier(opts.root),
    volatileTier(opts.goals, opts.now, opts.memory),
  ].filter(Boolean);
  return tiers.join("\n\n---\n\n");
}
