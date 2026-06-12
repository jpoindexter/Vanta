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
import { gatherCockpitData, EMPTY_COCKPIT, type CockpitData } from "./mission-control/cockpit-data.js";

export type OverlayKind = null | "sessions" | "model" | "skills" | "theme" | "cockpit";

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
  cockpitData: CockpitData;
  buildCtx: () => ReplCtx;
  openSessions: () => void;
  resumeSession: (id: string) => void;
  newSession: () => void;
  removeSession: (id: string) => void;
  openModel: () => void;
  selectModel: (sel: ModelSelection) => void;
  openSkills: () => void;
  openCockpit: () => void;
};

// Owns the TUI's overlay state and the side-effecting handlers behind the
// /sessions and /model pickers, so app.tsx stays a thin orchestrator. Session
// resume/new reuse the tested executeSlash logic; model switch reuses
// resolveProvider + the setup wizard's env writer (model-switch.ts).
/** ReplCtx factory for slash commands run from overlays — fresh per call so it
 * sees the current provider + session state. */
function makeBuildCtx(deps: OverlaysDeps, activeProvider: LLMProvider): () => ReplCtx {
  return () => ({
    convo: deps.convoRef.current!,
    setup: { ...deps.setup, provider: activeProvider },
    dataDir: join(deps.repoRoot, ".vanta"),
    state: deps.replStateRef.current,
    env: process.env,
    now: () => new Date(),
  });
}

/** Await an async load, then store the result + open its overlay. */
function loadAndOpen<T>(load: Promise<T>, setData: (t: T) => void, setOverlay: (o: OverlayKind) => void, kind: OverlayKind): void {
  void load.then((d) => { setData(d); setOverlay(kind); });
}

/** Apply a model selection, surfacing any error as a note, then close the overlay. */
function runModelSelection(sel: ModelSelection, deps: ModelApplyDeps, setOverlay: (o: OverlayKind) => void): void {
  try {
    applyModelSelection(sel, deps);
  } catch (err) {
    deps.dispatch({ t: "note", text: `  model switch failed: ${err instanceof Error ? err.message : String(err)}` });
  }
  setOverlay(null);
}

export function useOverlays(deps: OverlaysDeps): OverlaysResult {
  const { convoRef, repoRoot, activeProvider, setActiveProvider, dispatch } = deps;
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  const [skillList, setSkillList] = useState<Skill[]>([]);
  const [cockpitData, setCockpitData] = useState<CockpitData>(EMPTY_COCKPIT);
  const buildCtx = makeBuildCtx(deps, activeProvider);

  const openSessions = (): void => loadAndOpen(listSessions(process.env), setSessionList, setOverlay, "sessions");
  const openSkills = (): void => loadAndOpen(listSkills(process.env), setSkillList, setOverlay, "skills");
  // Mission-control: load live goals + loop state, then open. gatherCockpitData
  // never throws, so a kernel-down state opens an empty panel rather than failing.
  const openCockpit = (): void => loadAndOpen(gatherCockpitData({ client: deps.setup.safety, dataDir: join(repoRoot, ".vanta") }), setCockpitData, setOverlay, "cockpit");
  const openModel = (): void => setOverlay("model");

  const resumeSession = (id: string): void => { if (convoRef.current) runSlashAndClear(`/resume ${id}`, buildCtx(), dispatch, setOverlay); };
  const newSession = (): void => { if (convoRef.current) runSlashAndClear("/clear", buildCtx(), dispatch, setOverlay); };
  const removeSession = (id: string): void => {
    void deleteSession(id, process.env).catch(() => {});
    setSessionList((list) => list.filter((s) => s.id !== id));
  };
  const selectModel = (sel: ModelSelection): void => runModelSelection(sel, { convoRef, setActiveProvider, repoRoot, dispatch }, setOverlay);

  return { overlay, setOverlay, sessionList, skillList, cockpitData, buildCtx, openSessions, resumeSession, newSession, removeSession, openModel, selectModel, openSkills, openCockpit };
}
