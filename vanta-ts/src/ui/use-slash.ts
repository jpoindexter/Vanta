import { join } from "node:path";
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject } from "react";
import type { ComposerDraft, VoicePhase } from "./dictation-context.js";
import { voice } from "../repl/voice-cmd.js";
import { executeSlash } from "../repl-commands.js";
import { RESTART_EXIT_CODE } from "../repl/restart-cmd.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import type { Conversation } from "../agent.js";
import type { RunSetup } from "../session.js";
import type { ReplCtx, ReplState, SlashResult } from "../repl/types.js";
import type { SetupHandoff } from "../setup/handoff.js";
import type { Action } from "./reducer.js";

// Wires the full slash-command catalog into the v2 UI. Reuses the SAME executeSlash
// engine the readline REPL + old TUI use — every command keeps its behavior; only
// the result is mapped into the v2 reducer (notes commit to scrollback like any
// entry; resend drives a fresh agent turn; exit/restart end the session).

/** Side effects applySlashResult drives — explicit closures so it stays pure + testable. */
export type SlashEffects = {
  clear: () => void;
  note: (text: string) => void;
  send: (text: string, display?: string) => void;
  exit: () => void;
  composerAnchor: (mode: "float" | "bottom") => void;
  vimMode: (on: boolean) => void;
  setup: (request: SetupHandoff) => void;
  draft?: (text: string) => void;
};

function applyDraft(r: SlashResult, fx: SlashEffects): void {
  if (r.loadIntoComposer !== undefined) fx.draft?.(r.loadIntoComposer);
}

/** Map a SlashResult onto the host. Restart sets exit code 75 (run.sh re-execs). */
export function applySlashResult(r: SlashResult, fx: SlashEffects): void {
  if (r.exit || r.restart) {
    if (r.restart) process.exitCode = RESTART_EXIT_CODE;
    return void fx.exit();
  }
  if (r.composerAnchor) fx.composerAnchor(r.composerAnchor); // /composer → reposition input live
  if (r.vimMode !== undefined) fx.vimMode(r.vimMode); // /vim → toggle composer vi-mode live
  if (r.cleared) fx.clear(); // /clear → wipe committed TUI scrollback before the fresh-session note
  if (r.output) fx.note(r.output);
  applyDraft(r, fx);
  if (r.resend) fx.send(r.resend, r.resendDisplay);
  if (r.setupHandoff) fx.setup(r.setupHandoff);
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
  requestSetup: (request: SetupHandoff) => void;
};

export function useSlash(deps: SlashDeps) {
  const [composerDraft, setComposerDraft] = useState<ComposerDraft | null>(null);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const draftId = useRef(0);
  const mounted = useRef(true);
  const lifetime = useRef(new AbortController());
  const buildCtx = (): ReplCtx => ({
    convo: deps.convoRef.current!,
    setup: deps.setup,
    dataDir: join(deps.repoRoot, ".vanta"),
    state: deps.replStateRef.current,
    env: process.env,
    now: () => new Date(),
    onCompacting: (active, progress) => deps.dispatch({ t: "compacting", active, progress }),
    onVoicePhase: (phase) => { if (mounted.current) setVoicePhase(phase); },
    voiceSignal: lifetime.current.signal,
  });
  const fx: SlashEffects = {
    clear: () => deps.dispatch({ t: "clear" }),
    note: (text) => deps.dispatch({ t: "note", text }),
    send: deps.send,
    exit: deps.exit,
    composerAnchor: deps.setComposerAnchor,
    vimMode: deps.setVim,
    setup: deps.requestSetup,
    draft: (text) => setComposerDraft({ text, id: ++draftId.current }),
  };
  const runSlash = async (line: string): Promise<void> => {
    if (!deps.convoRef.current) return;
    const origin = { convo: deps.convoRef.current, session: deps.replStateRef.current.sessionId };
    if (/^\/(?:clear|new|reset|resume|fork|exit|quit|restart)(?:\s|$)/.test(line)) {
      await voice("cancel", buildCtx());
      setComposerDraft(null);
    }
    const r = await executeSlash(line, buildCtx());
    if (!mounted.current) return;
    if (r.loadIntoComposer !== undefined && (origin.convo !== deps.convoRef.current || origin.session !== deps.replStateRef.current.sessionId)) return;
    if (r.resend) {
      const command = line.split(/\s/)[0]?.slice(1) ?? "";
      await fireHooks(join(deps.repoRoot, ".vanta"), "UserPromptExpansion", { command, prompt: r.resend }, { cwd: deps.repoRoot, matcherValue: command, promptProvider: deps.setup.provider });
    }
    applySlashResult(r, fx);
  };
  useEffect(() => {
    mounted.current = true;
    lifetime.current = new AbortController();
    return () => { mounted.current = false; lifetime.current.abort(); void voice("cancel", buildCtx()); };
  }, []);
  return { runSlash, composerDraft, consumeDraft: () => setComposerDraft(null), voicePhase };
}
