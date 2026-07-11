import { type Dispatch } from "react";
import { isSlashLine, slashHead } from "./slash.js";
import { maybeRunShortcut } from "./shortcuts.js";
import { expandContextRefs, type ExpandResult } from "../context/ref-expand.js";
import { PICKER_KINDS, type OverlayKind } from "./overlays.js";
import type { KernelClient } from "../kernel/client.js";
import type { Action } from "./reducer.js";

// The composer submit router for the v2 UI. One place decides what a submitted
// line means: slash command, !/# prefix, or a plain message (with @-file content
// inlined). Rebuilt every render so it closes over fresh `busy` with no memo.

export type SubmitDeps = {
  runSlash: (line: string) => void;
  send: (text: string) => void;
  openOverlay: (kind: OverlayKind) => void;
  openGlobalSearch?: () => void;
  busy: boolean;
  safety: KernelClient;
  repoRoot: string;
  dispatch: Dispatch<Action>;
  detachBackgroundResponse?: () => void;
};

/** Resolve a line with bounded, source-labelled context and warning receipts. */
async function resolveLine(line: string, repoRoot: string): Promise<ExpandResult & { text: string }> {
  const result = await expandContextRefs(line, repoRoot);
  return { ...result, text: result.block ? `${result.block}\n\n${line}` : line };
}

function reportContext(result: ExpandResult, note: (text: string) => void): void {
  if (result.expanded.length) note(`  context expanded: ${result.expanded.join(", ")}`);
  for (const warning of result.warnings) note(`  context warning: ${warning}`);
}

/** A bare picker command (`/model`, `/cockpit`, …) with no argument → overlay kind. */
function pickerFor(text: string): OverlayKind | null {
  const head = slashHead(text);
  const hasArg = text.slice(1 + head.length).trim().length > 0;
  return !hasArg ? (PICKER_KINDS[head] ?? null) : null;
}

export function useSubmit(deps: SubmitDeps): (text: string) => void {
  const note = (text: string): void => deps.dispatch({ t: "note", text });
  return (text: string): void => {
    if (text === "?") return deps.openOverlay("help");
    if (isSlashLine(text)) return routeSlash(text, deps);
    if (maybeRunShortcut(text, { safety: deps.safety, repoRoot: deps.repoRoot, note })) return;
    void submitMessage(text, deps, note);
  };
}

function routeSlash(text: string, deps: SubmitDeps): void {
  const head = slashHead(text);
  if (deps.busy && head === "bg" && deps.detachBackgroundResponse) return deps.detachBackgroundResponse();
  if (head === "searchall" && !text.slice("/searchall".length).trim() && deps.openGlobalSearch) return deps.openGlobalSearch();
  const kind = pickerFor(text);
  return kind ? deps.openOverlay(kind) : deps.runSlash(text);
}

async function submitMessage(text: string, deps: SubmitDeps, note: (text: string) => void): Promise<void> {
  const resolved = await resolveLine(text, deps.repoRoot);
  reportContext(resolved, note);
  if (deps.busy) deps.dispatch({ t: "enqueue", text: resolved.text });
  else deps.send(resolved.text);
}
