import { join } from "node:path";
import { type Dispatch, type MutableRefObject } from "react";
import { executeSlash } from "../repl-commands.js";
import { RESTART_EXIT_CODE } from "../repl/restart-cmd.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import type { Conversation } from "../agent.js";
import type { RunSetup } from "../session.js";
import type { ReplCtx, ReplState, SlashResult } from "../repl/types.js";
import type { Action } from "./reducer.js";

// Wires the full slash-command catalog into the v2 UI. Reuses the SAME executeSlash
// engine the readline REPL + old TUI use — every command keeps its behavior; only
// the result is mapped into the v2 reducer (notes commit to scrollback like any
// entry; resend drives a fresh agent turn; exit/restart end the session).

/** Side effects applySlashResult drives — explicit closures so it stays pure + testable. */
export type SlashEffects = {
  note: (text: string) => void;
  send: (text: string, display?: string) => void;
  exit: () => void;
  composerAnchor: (mode: "float" | "bottom") => void;
  vimMode: (on: boolean) => void;
};

/** Map a SlashResult onto the host. Restart sets exit code 75 (run.sh re-execs). */
export function applySlashResult(r: SlashResult, fx: SlashEffects): void {
  if (r.exit || r.restart) {
    if (r.restart) process.exitCode = RESTART_EXIT_CODE;
    return void fx.exit();
  }
  if (r.composerAnchor) fx.composerAnchor(r.composerAnchor); // /composer → reposition input live
  if (r.vimMode !== undefined) fx.vimMode(r.vimMode); // /vim → toggle composer vi-mode live
  if (r.output) fx.note(r.output);
  if (r.resend) fx.send(r.resend, r.resendDisplay);
}

export type SlashDeps = {
  convoRef: MutableRefObject<Conversation | null>;
  replStateRef: MutableRefObject<ReplState>;
  setup: RunSetup;
  repoRoot: string;
  dispatch: Dispatch<Action>;
  send: (text: string, display?: string) => void;
  exit: () => void;
  setComposerAnchor: (mode: "float" | "bottom") => void;
  setVim: (on: boolean) => void;
};

export function useSlash(deps: SlashDeps): { runSlash: (line: string) => void } {
  const buildCtx = (): ReplCtx => ({
    convo: deps.convoRef.current!,
    setup: deps.setup,
    dataDir: join(deps.repoRoot, ".vanta"),
    state: deps.replStateRef.current,
    env: process.env,
    now: () => new Date(),
  });
  const fx: SlashEffects = {
    note: (text) => deps.dispatch({ t: "note", text }),
    send: deps.send,
    exit: deps.exit,
    composerAnchor: deps.setComposerAnchor,
    vimMode: deps.setVim,
  };
  const runSlash = (line: string): void => {
    if (!deps.convoRef.current) return;
    void executeSlash(line, buildCtx()).then(async (r) => {
      if (r.resend) {
        const command = line.split(/\s/)[0]?.slice(1) ?? "";
        await fireHooks(join(deps.repoRoot, ".vanta"), "UserPromptExpansion", { command, prompt: r.resend }, { cwd: deps.repoRoot, matcherValue: command, promptProvider: deps.setup.provider });
      }
      applySlashResult(r, fx);
    });
  };
  return { runSlash };
}
