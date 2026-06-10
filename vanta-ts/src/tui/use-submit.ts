import { type Dispatch, type SetStateAction, type MutableRefObject } from "react";
import { executeSlash, maybeDroppedImage, maybeDroppedVideo, SLASH_COMMANDS, type ReplState } from "../repl-commands.js";
import { RESTART_EXIT_CODE } from "../repl/restart-cmd.js";
import { parseAtRefs, buildContextBlock } from "./at-context.js";
import { parseShortcut, runBashShortcut, runMemoryShortcut } from "../repl/shortcuts.js";
import { classifyPromptKeyword, CONTINUE_NUDGE } from "../repl/prompt-keywords.js";
import type { Action } from "./app-reducer.js";
import type { Conversation } from "../agent.js";
import type { LLMProvider } from "../providers/interface.js";
import type { RunSetup } from "../session.js";
import type { ReplCtx, SlashResult } from "../repl/types.js";

type EditMode = { active: boolean; messageIndex: number };

/**
 * The composer submit pipeline, extracted from App so the component stays small.
 * Called every render with current values, so the returned `submit` closes over
 * fresh state exactly as an inline definition would (no memoization, no staleness).
 */
export type SubmitDeps = {
  convoRef: MutableRefObject<Conversation | null>;
  replStateRef: MutableRefObject<ReplState>;
  setup: RunSetup;
  repoRoot: string;
  pending: unknown; // truthy-checked only
  editMode: EditMode;
  busy: boolean;
  sel: number;
  dispatch: Dispatch<Action>;
  sendToAgent: (text: string) => void;
  buildCtx: () => ReplCtx;
  openSessions: () => void;
  openModel: () => void;
  exit: () => void;
  setInput: Dispatch<SetStateAction<string>>;
  setEditMode: Dispatch<SetStateAction<EditMode>>;
  setInputHistory: Dispatch<SetStateAction<string[]>>;
  setShowHelp: Dispatch<SetStateAction<boolean>>;
  setActiveProvider: Dispatch<SetStateAction<LLMProvider>>;
};

function applySlashResult(r: SlashResult, d: SubmitDeps): void {
  if (r.exit) return void d.exit();
  if (r.restart) { process.exitCode = RESTART_EXIT_CODE; return void d.exit(); } // run.sh re-execs on 75
  if (r.cleared) d.dispatch({ t: "clear" });
  if (r.provider) d.setActiveProvider(r.provider); // /model <arg> hot-swap → refresh banner
  if (r.output) d.dispatch({ t: "note", text: r.output });
  if (r.resend) d.sendToAgent(r.resend);
  if (r.loadIntoComposer !== undefined) {
    d.setInput(r.loadIntoComposer);
    d.setEditMode({ active: true, messageIndex: r.editMessageIndex ?? -1 });
  }
}

/** Expand a partial `/wor` to the selected command when it's an unambiguous prefix. */
function resolveSlashLine(line: string, sel: number): string {
  const head = line.slice(1).split(/\s+/)[0] ?? "";
  const ms = SLASH_COMMANDS.filter((c) => c.name.startsWith(head));
  const isPartial = !line.slice(1).includes(" ") && ms.length > 0 && !ms.some((c) => c.name === head);
  return isPartial ? `/${(ms[Math.min(sel, ms.length - 1)] ?? ms[0])!.name}` : line;
}

function runSlash(line: string, d: SubmitDeps): void {
  if (!d.convoRef.current) return;
  const effective = resolveSlashLine(line, d.sel);
  const parts = effective.slice(1).split(/\s+/);
  const resolvedCmd = parts[0] ?? "";
  const resolvedArg = parts.slice(1).join(" ").trim();
  if (resolvedCmd === "sessions" && !resolvedArg) return void d.openSessions();
  if (resolvedCmd === "model" && !resolvedArg) return void d.openModel();
  void executeSlash(effective, d.buildCtx()).then((r) => applySlashResult(r, d));
}

/** Route a slash command / `?` help / `!`-or-memory shortcut. Returns true if handled. */
function handleSpecialLine(line: string, d: SubmitDeps): boolean {
  const firstToken = line.slice(1).split(/\s/)[0] ?? "";
  if (line.startsWith("/") && !firstToken.includes("/")) { runSlash(line, d); return true; }
  if (line === "?") { d.setShowHelp((h) => !h); return true; }
  const shortcut = parseShortcut(line);
  if (shortcut) { runShortcut(shortcut, d); return true; }
  return false;
}

function applyEdit(line: string, d: SubmitDeps): void {
  d.setEditMode({ active: false, messageIndex: -1 });
  const convo = d.convoRef.current;
  const msg = convo?.messages[d.editMode.messageIndex];
  if (!line) { d.dispatch({ t: "note", text: "  · edit cancelled" }); return; }
  if (msg && msg.role === "assistant") {
    convo!.messages[d.editMode.messageIndex] = { ...msg, content: line };
    d.dispatch({ t: "note", text: "  ✎ response updated" });
  }
}

function runShortcut(s: NonNullable<ReturnType<typeof parseShortcut>>, d: SubmitDeps): void {
  const onOut = (out: string): void => d.dispatch({ t: "note", text: out });
  const onErr = (e: unknown): void => d.dispatch({ t: "note", text: `error: ${e instanceof Error ? e.message : String(e)}` });
  if (s.type === "bash") void runBashShortcut(s.cmd, d.setup.safety, d.repoRoot).then(onOut).catch(onErr);
  else void runMemoryShortcut(s.text, process.env).then(onOut).catch(onErr);
}

async function sendLine(line: string, d: SubmitDeps): Promise<void> {
  const dropped = await maybeDroppedImage(line);
  if (dropped) { (d.replStateRef.current.pendingImages ??= []).push(dropped); d.sendToAgent("Take a look at this image."); return; }
  const videoPath = await maybeDroppedVideo(line);
  if (videoPath) { d.sendToAgent(`Watch this video and describe what you see: ${videoPath}`); return; }
  const refs = parseAtRefs(line);
  const ctxBlock = refs.length > 0 ? await buildContextBlock(refs, d.repoRoot) : "";
  d.sendToAgent(ctxBlock ? `${ctxBlock}\n\n${line}` : line);
}

/** Build the composer `submit` handler from the current render's state/deps. */
export function useSubmit(d: SubmitDeps): (raw: string) => void {
  return (raw: string): void => {
    const line = raw.trim();
    d.setInput("");
    if (d.pending) return;
    if (d.editMode.active) return applyEdit(line, d);
    if (line) d.setInputHistory((h) => [...h, line]);
    if (!line) return;
    if (handleSpecialLine(line, d)) return;
    if (d.busy) { d.dispatch({ t: "enqueue", text: line }); return; }
    // Prompt keywords: a bare "keep going"/"continue" resumes the prior task.
    if (classifyPromptKeyword(line) === "continue") { d.sendToAgent(CONTINUE_NUDGE); return; }
    void sendLine(line, d);
  };
}
