import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { loadShellHooks, shellHooksPath } from "../hooks/shell-hooks.js";
import type { ShellHook, ShellHookEvent, ShellHooksConfig } from "../hooks/shell-hooks.js";
import type { SlashHandler } from "./types.js";

const EVENTS = ["PreToolUse", "PostToolUse", "Stop", "UserPromptSubmit", "SessionStart", "SessionEnd"] as const;
type ManagedEvent = typeof EVENTS[number];

function isManagedEvent(value: string): value is ManagedEvent {
  return (EVENTS as readonly string[]).includes(value);
}

async function saveHooks(dataDir: string, config: ShellHooksConfig): Promise<void> {
  const path = shellHooksPath(dataDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function rows(config: ShellHooksConfig): string[] {
  const out: string[] = [];
  for (const event of EVENTS) {
    const hooks = config[event as ShellHookEvent] ?? [];
    if (!hooks.length) continue;
    out.push(`  ${event}`);
    hooks.forEach((hook, index) => out.push(`    ${index + 1}. ${hook.command}`));
  }
  return out;
}

async function list(dataDir: string): Promise<string> {
  const lines = rows(await loadShellHooks(dataDir));
  return lines.length ? lines.join("\n") : `  (no hooks configured — /hooks add <event> <cmd>)`;
}

function parseAdd(arg: string): { event: ManagedEvent; command: string } | null {
  const match = arg.match(/^add\s+(\S+)\s+([\s\S]+)$/);
  if (!match || !match[1] || !match[2] || !isManagedEvent(match[1])) return null;
  return { event: match[1], command: match[2].trim() };
}

function parseRemove(arg: string): { event: ManagedEvent; index: number } | null {
  const match = arg.match(/^remove\s+(\S+)\s+(\d+)$/);
  const index = Number(match?.[2]);
  if (!match?.[1] || !isManagedEvent(match[1]) || !Number.isInteger(index) || index < 1) return null;
  return { event: match[1], index };
}

export const hooks: SlashHandler = async (arg, ctx) => {
  const trimmed = arg.trim();
  if (!trimmed) return { output: await list(ctx.dataDir) };

  const add = parseAdd(trimmed);
  if (add) {
    const config = await loadShellHooks(ctx.dataDir);
    const hook: ShellHook = { command: add.command };
    config[add.event] = [...(config[add.event] ?? []), hook];
    await saveHooks(ctx.dataDir, config);
    return { output: `  ✓ added ${add.event} hook #${config[add.event]?.length ?? 1}` };
  }

  const remove = parseRemove(trimmed);
  if (remove) {
    const config = await loadShellHooks(ctx.dataDir);
    const hooksForEvent = [...(config[remove.event] ?? [])];
    const [removed] = hooksForEvent.splice(remove.index - 1, 1);
    if (!removed) return { output: `  no ${remove.event} hook #${remove.index}` };
    config[remove.event] = hooksForEvent;
    await saveHooks(ctx.dataDir, config);
    return { output: `  ✓ removed ${remove.event} hook #${remove.index}: ${removed.command}` };
  }

  return { output: `  usage: /hooks | /hooks add <event> <cmd> | /hooks remove <event> <N>` };
};
