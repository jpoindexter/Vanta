import type { VantaTheme } from "./theme.js";

// Composer border/prompt/placeholder by state. Default (idle) takes its colours
// from the active theme so /theme restyles the input live; edit + busy states
// override with their own fixed colours. Extracted from app.tsx to keep that
// file under the size gate.

export type ComposerColors = { borderColor: string; promptColor: string; placeholder: string; isHistoryActive: boolean };

export function composerColors(o: {
  theme: VantaTheme;
  editActive: boolean;
  busy: boolean;
  showPalette: boolean;
  showAtPalette: boolean;
}): ComposerColors {
  if (o.editActive) return { borderColor: "yellow", promptColor: "yellow", placeholder: "editing response — ⏎ confirm, clear + ⏎ cancel", isHistoryActive: false };
  if (o.busy) return { borderColor: "gray", promptColor: "gray", placeholder: "working…", isHistoryActive: false };
  return { borderColor: o.theme.border, promptColor: o.theme.accent, placeholder: "Ask Vanta anything — /help for commands", isHistoryActive: !o.showPalette && !o.showAtPalette };
}
