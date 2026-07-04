import { createInterface } from "node:readline/promises";
import { createConversation } from "./agent.js";
import { executeSlash } from "./repl-commands.js";
import { RESTART_EXIT_CODE } from "./repl/restart-cmd.js";
import { parseShortcut, runBashShortcut, runMemoryShortcut } from "./repl/shortcuts.js";
import { fireHooks } from "./hooks/shell-hooks.js";
import { drainAsyncReentry } from "./subagent/async-delegate.js";
import type { UserCommand } from "./commands/loader.js";
import type { RunSetup } from "./session.js";

type SlashCtx = Parameters<typeof executeSlash>[1];
type CpFn = (a: string, c: SlashCtx) => unknown;
export type SlashResult = { exit?: boolean; restart?: boolean; editPrefill?: string; editMsgIdx?: number };

function printCpOutput(r: unknown): void {
  if (r && typeof r === "object" && "output" in r) console.log((r as { output: unknown }).output);
}

async function tryCheckpointCmd(o: { line: string; firstToken: string; ctx: SlashCtx; cp: CpFn; rb: CpFn; rs: CpFn }): Promise<SlashResult | null> {
  const rest = o.line.slice(o.firstToken.length + 1).trim();
  if (o.firstToken === "checkpoint") { printCpOutput(o.cp(rest, o.ctx)); return {}; }
  if (o.firstToken === "rollback") { printCpOutput(o.rb("", o.ctx)); return {}; }
  if (o.firstToken === "restore") { printCpOutput(await o.rs(rest, o.ctx)); return {}; }
  return null;
}

type SlashOpts = { line: string; firstToken: string; ctx: SlashCtx; cp: CpFn; rb: CpFn; rs: CpFn; userCommands: UserCommand[]; repoRoot: string; runUserTurn: (t: string) => Promise<void> };

async function handleSlashLine(o: SlashOpts): Promise<SlashResult> {
  const cpResult = await tryCheckpointCmd({ line: o.line, firstToken: o.firstToken, ctx: o.ctx, cp: o.cp, rb: o.rb, rs: o.rs });
  if (cpResult) return cpResult;
  const userCmd = o.userCommands.find((c) => c.name === o.firstToken);
  if (userCmd) {
    const arg = o.line.slice(o.firstToken.length + 2).trim();
    const prompt = arg ? `${userCmd.content}\n\nArgs: ${arg}` : userCmd.content;
    await fireHooks(o.ctx.dataDir, "UserPromptExpansion", { command: o.firstToken, prompt }, { cwd: o.repoRoot, matcherValue: o.firstToken, promptProvider: o.ctx.setup.provider });
    await o.runUserTurn(prompt);
    return {};
  }
  return dispatchSlash(o.line, o.ctx, o.repoRoot, o.runUserTurn);
}

async function dispatchSlash(line: string, ctx: SlashCtx, repoRoot: string, runUserTurn: (t: string) => Promise<void>): Promise<SlashResult> {
  const result = await executeSlash(line, ctx);
  if (result.output) console.log(result.output);
  if (result.exit) return { exit: true };
  if (result.restart) return { restart: true };
  if (result.resend) {
    const command = line.split(/\s/)[0]?.slice(1) ?? "";
    await fireHooks(ctx.dataDir, "UserPromptExpansion", { command, prompt: result.resend }, { cwd: repoRoot, matcherValue: command, promptProvider: ctx.setup.provider });
    await runUserTurn(result.resend);
  }
  if (result.loadIntoComposer !== undefined) return { editPrefill: result.loadIntoComposer, editMsgIdx: result.editMessageIndex ?? -1 };
  return {};
}

export type ReplDeps = {
  rl: ReturnType<typeof createInterface>;
  convo: ReturnType<typeof createConversation>;
  ctx: SlashCtx;
  cp: CpFn;
  rb: CpFn;
  rs: CpFn;
  userCommands: UserCommand[];
  setup: RunSetup;
  repoRoot: string;
  runUserTurn: (text: string) => Promise<void>;
  /** VANTA-BUDGET-CAP: when its .current is set true mid-turn, the loop ends the
   * session cleanly after that turn (the spend cap was reached). */
  capHaltedRef?: { current: boolean };
};

async function runShortcut(line: string, deps: Pick<ReplDeps, "setup" | "repoRoot">): Promise<void> {
  const shortcut = parseShortcut(line);
  if (!shortcut) return;
  if (shortcut.type === "bash") console.log(await runBashShortcut(shortcut.cmd, deps.setup.safety, deps.repoRoot).catch((e: unknown) => `error: ${e instanceof Error ? e.message : String(e)}`));
  else console.log(await runMemoryShortcut(shortcut.text, process.env).catch((e: unknown) => `error: ${e instanceof Error ? e.message : String(e)}`));
}

function applyEditMode(line: string, editState: { prefill: string | null; msgIdx: number | null }, convo: ReturnType<typeof createConversation>): boolean {
  if (editState.msgIdx === null) return false;
  const idx = editState.msgIdx; editState.msgIdx = null;
  const msg = convo.messages[idx];
  if (msg && msg.role === "assistant") { convo.messages[idx] = { ...msg, content: line }; console.log("  ✎ response updated"); }
  return true;
}

async function replIteration(
  line: string,
  editState: { prefill: string | null; msgIdx: number | null },
  d: ReplDeps,
): Promise<{ stop?: boolean }> {
  if (applyEditMode(line, editState, d.convo)) return {};
  const firstToken = line.slice(1).split(/\s/)[0] ?? "";
  if (line.startsWith("/") && !firstToken.includes("/")) {
    const r = await handleSlashLine({ line, firstToken, ctx: d.ctx, cp: d.cp, rb: d.rb, rs: d.rs, userCommands: d.userCommands, repoRoot: d.repoRoot, runUserTurn: d.runUserTurn });
    if (r.exit) return { stop: true };
    if (r.restart) { process.exitCode = RESTART_EXIT_CODE; return { stop: true }; }
    if (r.editPrefill !== undefined) { editState.prefill = r.editPrefill; editState.msgIdx = r.editMsgIdx ?? -1; }
    return {};
  }
  if (parseShortcut(line)) { await runShortcut(line, d); return {}; }
  await d.runUserTurn(line);
  return {};
}

export async function runReplLoop(d: ReplDeps): Promise<void> {
  const editState = { prefill: null as string | null, msgIdx: null as number | null };
  for (;;) {
    // VANTA-ASYNC-DELEGATE: at the idle boundary, a finished background worker
    // re-enters as a fresh turn (preserves message order + the prompt cache).
    const reentry = await drainAsyncReentry(d.ctx.dataDir);
    if (reentry) { await d.runUserTurn(reentry); continue; }
    let line: string;
    try {
      const q = d.rl.question("\nvanta › ");
      if (editState.prefill !== null) { d.rl.write(editState.prefill); editState.prefill = null; }
      line = (await q).trim();
    } catch { break; }
    if (!line) continue;
    const res = await replIteration(line, editState, d);
    if (res.stop) break;
    if (d.capHaltedRef?.current) break;
  }
}
