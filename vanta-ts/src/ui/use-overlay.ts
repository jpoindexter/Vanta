import { join } from "node:path";
import { useState } from "react";
import { listSessions } from "../sessions/store.js";
import { listSkills } from "../skills/store.js";
import { currentThemeName } from "../tui/theme.js";
import { gatherCockpitData, type CockpitData } from "../tui/mission-control/cockpit-data.js";
import { sessionRows, skillRows, modelRows, themeRows, type OverlayKind, type OverlayRow } from "./overlays.js";
import type { RunSetup } from "../session.js";

// Owns the inline-overlay state for the v2 UI. Open loads the overlay's data
// (best-effort), select runs the row's slash command and closes. Mirrors the old
// TUI's use-overlays, but renders inline instead of fullscreen.

export type OverlayView =
  | { kind: "list"; title: string; rows: OverlayRow[] }
  | { kind: "cockpit"; data: CockpitData }
  | { kind: "help" };

async function loadOverlay(kind: OverlayKind, setup: RunSetup, repoRoot: string): Promise<OverlayView> {
  switch (kind) {
    case "model": return { kind: "list", title: "Switch model", rows: modelRows(process.env.VANTA_PROVIDER ?? "openai") };
    case "theme": return { kind: "list", title: "Theme", rows: themeRows(currentThemeName(process.env)) };
    case "sessions": return { kind: "list", title: "Sessions", rows: sessionRows(await listSessions(process.env)) };
    case "skills": return { kind: "list", title: "Skills", rows: skillRows(await listSkills(process.env)) };
    case "cockpit": return { kind: "cockpit", data: await gatherCockpitData({ client: setup.safety, dataDir: join(repoRoot, ".vanta") }) };
    case "help": return { kind: "help" };
  }
}

export function useOverlay(deps: { setup: RunSetup; repoRoot: string; runSlash: (line: string) => void }): {
  overlay: OverlayView | null;
  openOverlay: (kind: OverlayKind) => void;
  closeOverlay: () => void;
  selectRow: (row: OverlayRow) => void;
} {
  const [overlay, setOverlay] = useState<OverlayView | null>(null);
  const openOverlay = (kind: OverlayKind): void => {
    void loadOverlay(kind, deps.setup, deps.repoRoot).then(setOverlay).catch(() => {});
  };
  const closeOverlay = (): void => setOverlay(null);
  const selectRow = (row: OverlayRow): void => { deps.runSlash(row.command); setOverlay(null); };
  return { overlay, openOverlay, closeOverlay, selectRow };
}
