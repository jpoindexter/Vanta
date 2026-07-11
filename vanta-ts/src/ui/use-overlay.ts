import { join } from "node:path";
import { useState } from "react";
import { listSessions } from "../sessions/store.js";
import { listSkills } from "../skills/store.js";
import { gatherCockpitData, type CockpitData } from "../tui/mission-control/cockpit-data.js";
import { gatherStats, type UsageStats } from "./stats-data.js";
import { sessionRows, skillRows, modelRows, PICKER_KINDS, type OverlayKind, type OverlayRow } from "./overlays.js";
import { listLoopSummaries, type LoopSummary } from "../loop/summary.js";
import { listChangedFiles, type ChangedFile } from "../repl/changed-files.js";
import { contextBreakdown, type CtxCategory } from "./context-breakdown.js";
import { gatherMcpConnections, reconnectServer, type McpConnection } from "../mcp/connect.js";
import { elicitationMessage, type ElicitationRequest } from "./elicitation-dialog.js";
import type { McpServerView } from "./mcp-view.js";
import { reloadTasks } from "./tasks-actions.js";
import { buildSandboxOverlay, type SandboxOverlayState } from "./sandbox-actions.js";
import { buildConfigOverlay, type ConfigOverlayState } from "./config-actions.js";
import { buildHooksOverlay, type HooksOverlayState } from "./hooks-actions.js";
import { reloadTeams, type TeamsData } from "./teams-actions.js";
import { loadMemoryOverlayData, type MemoryOverlayData } from "./memory-actions.js";
import { loadWorkflowSelectData, type WorkflowSelectData } from "./workflow-select-actions.js";
import { loadOutputStyleData, type OutputStyleData } from "./output-style-actions.js";
import { loadAgentEditorData, type AgentEditorData } from "./agent-editor-actions.js";
import type { ExportContext } from "./export-actions.js";
import type { WorkerTask } from "../team/tasks.js";
import type { RunSetup } from "../session.js";
import type { PluginPanel } from "../plugins/panels.js";

/** Live conversation snapshot the /context overlay computes its breakdown from. */
export type CtxSnapshot = { messages: import("../types.js").Message[]; contextWindow: number; sessionId?: string; title?: string };

// Owns the inline-overlay state for the v2 UI. Open loads the overlay's data
// (best-effort), select runs the row's slash command and closes. Mirrors the old
// TUI's use-overlays, but renders inline instead of fullscreen.

export type OverlayView =
  | { kind: "list"; title: string; rows: OverlayRow[] }
  | { kind: "cockpit"; data: CockpitData }
  | { kind: "stats"; stats: UsageStats }
  | { kind: "loops"; loops: LoopSummary[] }
  | { kind: "review"; files: ChangedFile[]; cwd: string }
  | { kind: "context"; categories: CtxCategory[]; total: number; contextWindow: number }
  | { kind: "mcp"; servers: McpServerView[]; elicitation: ElicitationRequest | null; reconnect: (name: string) => void; onElicitationDone: () => void; dispose: () => void }
  | { kind: "tasks"; tasks: WorkerTask[] }
  | { kind: "agentEditor"; data: AgentEditorData; repoRoot: string }
  | { kind: "teams"; data: TeamsData }
  | { kind: "memory"; data: MemoryOverlayData; repoRoot: string }
  | { kind: "workflowSelect"; data: WorkflowSelectData; repoRoot: string }
  | { kind: "outputStyle"; data: OutputStyleData; repoRoot: string }
  | { kind: "export"; context: ExportContext; repoRoot: string }
  | ({ kind: "sandbox" } & SandboxOverlayState)
  | ({ kind: "config" } & ConfigOverlayState)
  | ({ kind: "hooks" } & HooksOverlayState)
  | { kind: "pluginPanel"; panel: PluginPanel }
  | { kind: "help" };

/** The four picker kinds that resolve to a generic selectable list; null otherwise. */
async function listOverlay(kind: OverlayKind): Promise<OverlayView | null> {
  if (kind === "model") return { kind: "list", title: "Switch model", rows: modelRows(process.env.VANTA_PROVIDER ?? "openai") };
  if (kind === "sessions") return { kind: "list", title: "Sessions", rows: sessionRows(await listSessions(process.env)) };
  if (kind === "skills") return { kind: "list", title: "Skills", rows: skillRows(await listSkills(process.env)) };
  return null;
}

async function loadOverlay(kind: OverlayKind, setup: RunSetup, repoRoot: string, getCtx?: () => CtxSnapshot): Promise<OverlayView> {
  const list = await listOverlay(kind);
  if (list) return list;
  const dataDir = join(repoRoot, ".vanta");
  switch (kind) {
    case "cockpit": return { kind: "cockpit", data: await gatherCockpitData({ client: setup.safety, dataDir }) };
    case "stats": return { kind: "stats", stats: await gatherStats({ repoRoot }) };
    case "loops": return { kind: "loops", loops: await listLoopSummaries(dataDir) };
    case "review": return { kind: "review", files: await listChangedFiles(repoRoot), cwd: repoRoot };
    case "context": return contextOverlay(setup, getCtx);
    case "tasks": return { kind: "tasks", tasks: await reloadTasks(process.env) };
    case "agentEditor": return { kind: "agentEditor", data: await loadAgentEditorData(repoRoot, setup.registry.schemas().map((s) => s.name), process.env), repoRoot };
    case "teams": return { kind: "teams", data: await reloadTeams(process.env) };
    case "memory": return { kind: "memory", data: await loadMemoryOverlayData(repoRoot, process.env), repoRoot };
    case "workflowSelect": return { kind: "workflowSelect", data: await loadWorkflowSelectData(repoRoot), repoRoot };
    case "outputStyle": return { kind: "outputStyle", data: await loadOutputStyleData(repoRoot, process.env), repoRoot };
    case "export": return { kind: "export", context: exportContext(getCtx), repoRoot };
    case "pluginPanels": return {
      kind: "list",
      title: "Plugin panels",
      rows: (setup.pluginPanels?.list() ?? []).map((panel) => ({
        label: panel.title,
        hint: `${panel.plugin} worker`,
        command: `plugin-panel:${panel.key}`,
      })),
    };
    default: return { kind: "help" };
  }
}

type SetOverlay = (fn: (prev: OverlayView | null) => OverlayView | null) => void;

/** A bare slash command from a /config row → reopen the matching picker overlay
 *  (e.g. /model → the model picker), else run it as a normal slash command. */
function reopenAsPicker(line: string, openOverlay: (kind: OverlayKind) => void, runSlash: (line: string) => void): void {
  const head = line.replace(/^\//, "").split(/\s+/)[0] ?? "";
  const picker = PICKER_KINDS[head];
  if (picker) openOverlay(picker);
  else runSlash(line);
}

/**
 * Build the interactive /mcp overlay. Connects to every configured server,
 * wires per-server reconnect (re-runs the connect path) and an elicitation
 * handler that surfaces the ElicitationDialog and resolves the server's request
 * with the operator's answer. Bound to setOverlay so reconnect/elicitation
 * update the live overlay in place.
 */
async function buildMcpOverlay(repoRoot: string, setOverlay: SetOverlay): Promise<OverlayView> {
  const live = new Map<string, McpConnection>();
  let disposed = false;
  const onElicit = (req: { server: string; method: string; params: unknown }): Promise<Record<string, unknown>> =>
    new Promise((resolve) => {
      const request: ElicitationRequest = { server: req.server, message: elicitationMessage(req.params), resolve };
      setOverlay((prev) => (prev?.kind === "mcp" ? { ...prev, elicitation: request } : prev));
    });
  const onElicitationDone = (): void => setOverlay((prev) => (prev?.kind === "mcp" ? { ...prev, elicitation: null } : prev));
  const reconnect = (name: string): void => {
    void reconnectServer(name, { cwd: repoRoot, onElicit, previous: live.get(name) }).then((conn) => {
      if (disposed) { try { conn.client?.close(); } catch { /* already gone */ } return; }
      live.set(name, conn);
      setOverlay((prev) => (prev?.kind === "mcp" ? { ...prev, servers: prev.servers.map((s) => (s.name === name ? conn : s)) } : prev));
    });
  };
  const connections = await gatherMcpConnections({ cwd: repoRoot, onElicit });
  for (const connection of connections) live.set(connection.name, connection);
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const connection of live.values()) { try { connection.client?.close(); } catch { /* already gone */ } }
    live.clear();
  };
  return { kind: "mcp", servers: connections, elicitation: null, reconnect, onElicitationDone, dispose };
}

/** Build the /context overlay: per-category token breakdown of the live convo. */
function contextOverlay(setup: RunSetup, getCtx?: () => CtxSnapshot): OverlayView {
  const snap = getCtx?.() ?? { messages: [], contextWindow: 0 };
  const toolChars = JSON.stringify(setup.registry.schemas()).length;
  const categories = contextBreakdown(snap.messages, toolChars);
  const total = categories.reduce((a, c) => a + c.tokens, 0);
  return { kind: "context", categories, total, contextWindow: snap.contextWindow };
}

function exportContext(getCtx?: () => CtxSnapshot): ExportContext {
  const snap = getCtx?.();
  return {
    sessionId: snap?.sessionId ?? "session",
    title: snap?.title,
    messages: snap?.messages ?? [],
  };
}

export function useOverlay(deps: { setup: RunSetup; repoRoot: string; runSlash: (line: string) => void; getContext?: () => CtxSnapshot }): {
  overlay: OverlayView | null;
  openOverlay: (kind: OverlayKind) => void;
  closeOverlay: () => void;
  selectRow: (row: OverlayRow) => void;
} {
  const [overlay, setOverlay] = useState<OverlayView | null>(null);
  const openOverlay = (kind: OverlayKind): void => {
    if (kind === "mcp") return void buildMcpOverlay(deps.repoRoot, setOverlay).then(setOverlay).catch(() => {});
    if (kind === "sandbox") {
      const host = { publish: (v: OverlayView) => setOverlay((prev) => (prev?.kind === "sandbox" ? v : prev)), isOpen: () => true };
      return void buildSandboxOverlay(deps.repoRoot, host).then(setOverlay).catch(() => {});
    }
    if (kind === "config") {
      const host = {
        publish: (v: OverlayView) => setOverlay((prev) => (prev?.kind === "config" ? v : prev)),
        isOpen: () => true,
        openCommand: (line: string) => { setOverlay(null); reopenAsPicker(line, openOverlay, deps.runSlash); },
      };
      return void buildConfigOverlay(deps.repoRoot, host).then(setOverlay).catch(() => {});
    }
    if (kind === "hooks") {
      const host = { publish: (v: OverlayView) => setOverlay((prev) => (prev?.kind === "hooks" ? v : prev)), isOpen: () => true };
      return void buildHooksOverlay(deps.repoRoot, host).then(setOverlay).catch(() => {});
    }
    void loadOverlay(kind, deps.setup, deps.repoRoot, deps.getContext).then(setOverlay).catch(() => {});
  };
  const closeOverlay = (): void => setOverlay((prev) => {
    if (prev?.kind === "mcp") prev.dispose();
    return null;
  });
  const selectRow = (row: OverlayRow): void => {
    if (row.command.startsWith("plugin-panel:")) {
      const panel = deps.setup.pluginPanels?.get(row.command.slice("plugin-panel:".length));
      setOverlay(panel ? { kind: "pluginPanel", panel } : null);
      return;
    }
    deps.runSlash(row.command);
    setOverlay(null);
  };
  return { overlay, openOverlay, closeOverlay, selectRow };
}
