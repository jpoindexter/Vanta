import { join } from "node:path";
import { useState } from "react";
import { resolveSessionStore } from "../sessions/index.js";
import { listSkills } from "../skills/store.js";
import { currentThemeName } from "../term/theme.js";
import { gatherCockpitData, type CockpitData } from "../tui/mission-control/cockpit-data.js";
import { sessionRows, skillRows, modelRows, themeRows, type OverlayKind, type OverlayRow } from "./overlays.js";
import { listLoopSummaries, type LoopSummary } from "../loop/summary.js";
import { listChangedFiles, type ChangedFile } from "../repl/changed-files.js";
import { contextBreakdown, type CtxCategory } from "./context-breakdown.js";
import type { RunSetup } from "../session.js";

/** Live conversation snapshot the /context overlay computes its breakdown from. */
export type CtxSnapshot = { messages: { role: string; content?: string }[]; contextWindow: number };

// Owns the inline-overlay state for the v2 UI. Open loads the overlay's data
// (best-effort), select runs the row's slash command and closes. Mirrors the old
// TUI's use-overlays, but renders inline instead of fullscreen.

export type OverlayView =
  | { kind: "list"; title: string; rows: OverlayRow[] }
  | { kind: "cockpit"; data: CockpitData }
  | { kind: "loops"; loops: LoopSummary[] }
  | { kind: "review"; files: ChangedFile[]; cwd: string }
  | { kind: "context"; categories: CtxCategory[]; total: number; contextWindow: number }
  | { kind: "help" };

/** The four picker kinds that resolve to a generic selectable list; null otherwise. */
async function listOverlay(kind: OverlayKind): Promise<OverlayView | null> {
  if (kind === "model") return { kind: "list", title: "Switch model", rows: modelRows(process.env.VANTA_PROVIDER ?? "openai") };
  if (kind === "theme") return { kind: "list", title: "Theme", rows: themeRows(currentThemeName(process.env)) };
  if (kind === "sessions") return { kind: "list", title: "Sessions", rows: sessionRows(await resolveSessionStore(process.env).listSessions(process.env)) };
  if (kind === "skills") return { kind: "list", title: "Skills", rows: skillRows(await listSkills(process.env)) };
  return null;
}

async function loadOverlay(kind: OverlayKind, setup: RunSetup, repoRoot: string, getCtx?: () => CtxSnapshot): Promise<OverlayView> {
  const list = await listOverlay(kind);
  if (list) return list;
  const dataDir = join(repoRoot, ".vanta");
  switch (kind) {
    case "cockpit": return { kind: "cockpit", data: await gatherCockpitData({ client: setup.safety, dataDir }) };
    case "loops": return { kind: "loops", loops: await listLoopSummaries(dataDir) };
    case "review": return { kind: "review", files: await listChangedFiles(repoRoot), cwd: repoRoot };
    case "context": return contextOverlay(setup, getCtx);
    default: return { kind: "help" };
  }
}

/** Build the /context overlay: per-category token breakdown of the live convo. */
function contextOverlay(setup: RunSetup, getCtx?: () => CtxSnapshot): OverlayView {
  const snap = getCtx?.() ?? { messages: [], contextWindow: 0 };
  const toolChars = JSON.stringify(setup.registry.schemas()).length;
  const categories = contextBreakdown(snap.messages, toolChars);
  const total = categories.reduce((a, c) => a + c.tokens, 0);
  return { kind: "context", categories, total, contextWindow: snap.contextWindow };
}

export function useOverlay(deps: { setup: RunSetup; repoRoot: string; runSlash: (line: string) => void; getContext?: () => CtxSnapshot }): {
  overlay: OverlayView | null;
  openOverlay: (kind: OverlayKind) => void;
  closeOverlay: () => void;
  selectRow: (row: OverlayRow) => void;
} {
  const [overlay, setOverlay] = useState<OverlayView | null>(null);
  const openOverlay = (kind: OverlayKind): void => {
    void loadOverlay(kind, deps.setup, deps.repoRoot, deps.getContext).then(setOverlay).catch(() => {});
  };
  const closeOverlay = (): void => setOverlay(null);
  const selectRow = (row: OverlayRow): void => { deps.runSlash(row.command); setOverlay(null); };
  return { overlay, openOverlay, closeOverlay, selectRow };
}
