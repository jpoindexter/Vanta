import { useState, type MutableRefObject } from "react";
import { join } from "node:path";
import { buildSummarizer } from "../session.js";
import { executeSlash, type ReplCtx, type ReplState } from "../repl-commands.js";
import { listSessions, deleteSession, type SessionMeta } from "../sessions/store.js";
import { listSkills } from "../skills/store.js";
import type { Skill } from "../skills/types.js";
import { providerById } from "../providers/catalog.js";
import { buildProviderForSelection, persistSelectionGlobal } from "./model-switch.js";
import type { Conversation } from "../agent.js";
import type { RunSetup } from "../session.js";
import type { LLMProvider } from "../providers/interface.js";
import type { ModelSelection } from "./model-picker.js";
import type { Action } from "./app.js";

export type OverlayKind = null | "sessions" | "model" | "skills";

type ModelApplyDeps = {
  convoRef: import("react").MutableRefObject<import("../agent.js").Conversation | null>;
  setActiveProvider: (p: LLMProvider) => void;
  repoRoot: string;
  dispatch: (a: Action) => void;
};

/** Run a slash command, dispatch clear, optionally note the output, then close the overlay. */
function runSlashAndClear(
  cmd: string,
  ctx: import("../repl-commands.js").ReplCtx,
  dispatch: (a: Action) => void,
  setOverlay: (o: OverlayKind) => void,
): void {
  void executeSlash(cmd, ctx).then((r) => {
    dispatch({ t: "clear" });
    if (r.output) dispatch({ t: "note", text: r.output });
    setOverlay(null);
  });
}

/** Apply a model selection: mutate env, hot-swap the provider, dispatch a note. */
function applyModelSelection(sel: ModelSelection, deps: ModelApplyDeps): void {
  const { convoRef, setActiveProvider, repoRoot, dispatch } = deps;
  const provider = buildProviderForSelection(sel, process.env);
  process.env.VANTA_PROVIDER = sel.providerId;
  process.env.VANTA_MODEL = sel.model;
  const entry = providerById(sel.providerId);
  if (entry?.envVar && sel.apiKey) process.env[entry.envVar] = sel.apiKey;
  convoRef.current?.setProvider(provider, buildSummarizer(provider));
  setActiveProvider(provider);
  if (sel.persistGlobal) void persistSelectionGlobal(sel, repoRoot).catch(() => {});
  dispatch({
    t: "note",
    text: `  ⚓ model → ${provider.modelId()} (${sel.persistGlobal ? "saved to .env" : "this session"})`,
  });
}

export type OverlaysDeps = {
  convoRef: MutableRefObject<Conversation | null>;
  replStateRef: MutableRefObject<ReplState>;
  setup: RunSetup;
  repoRoot: string;
  activeProvider: LLMProvider;
  setActiveProvider: (p: LLMProvider) => void;
  dispatch: (a: Action) => void;
};

export type OverlaysResult = {
  overlay: OverlayKind;
  setOverlay: (o: OverlayKind) => void;
  sessionList: SessionMeta[];
  skillList: Skill[];
  buildCtx: () => ReplCtx;
  openSessions: () => void;
  resumeSession: (id: string) => void;
  newSession: () => void;
  removeSession: (id: string) => void;
  openModel: () => void;
  selectModel: (sel: ModelSelection) => void;
  openSkills: () => void;
};

// Owns the TUI's overlay state and the side-effecting handlers behind the
// /sessions and /model pickers, so app.tsx stays a thin orchestrator. Session
// resume/new reuse the tested executeSlash logic; model switch reuses
// resolveProvider + the setup wizard's env writer (model-switch.ts).
export function useOverlays(deps: OverlaysDeps): OverlaysResult {
  const { convoRef, replStateRef, setup, repoRoot, activeProvider, setActiveProvider, dispatch } = deps;
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  const [skillList, setSkillList] = useState<Skill[]>([]);

  const buildCtx = (): ReplCtx => ({
    convo: convoRef.current!,
    setup: { ...setup, provider: activeProvider },
    dataDir: join(repoRoot, ".vanta"),
    state: replStateRef.current,
    env: process.env,
    now: () => new Date(),
  });

  const openSessions = (): void => {
    void listSessions(process.env).then((list) => {
      setSessionList(list);
      setOverlay("sessions");
    });
  };

  const resumeSession = (id: string): void => {
    if (!convoRef.current) return;
    runSlashAndClear(`/resume ${id}`, buildCtx(), dispatch, setOverlay);
  };

  const newSession = (): void => {
    if (!convoRef.current) return;
    runSlashAndClear("/clear", buildCtx(), dispatch, setOverlay);
  };

  const removeSession = (id: string): void => {
    void deleteSession(id, process.env).catch(() => {});
    setSessionList((list) => list.filter((s) => s.id !== id));
  };

  const openModel = (): void => setOverlay("model");

  const openSkills = (): void => {
    void listSkills(process.env).then((list) => {
      setSkillList(list);
      setOverlay("skills");
    });
  };

  const selectModel = (sel: ModelSelection): void => {
    try {
      applyModelSelection(sel, { convoRef, setActiveProvider, repoRoot, dispatch });
    } catch (err) {
      dispatch({ t: "note", text: `  model switch failed: ${err instanceof Error ? err.message : String(err)}` });
    }
    setOverlay(null);
  };

  return { overlay, setOverlay, sessionList, skillList, buildCtx, openSessions, resumeSession, newSession, removeSession, openModel, selectModel, openSkills };
}
