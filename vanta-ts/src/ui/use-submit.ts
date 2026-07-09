import { type Dispatch } from "react";
import { isSlashLine, slashHead } from "./slash.js";
import { maybeRunShortcut } from "./shortcuts.js";
import { parseAtRefs, buildContextBlock } from "./at.js";
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
  busy: boolean;
  backgroundBusy?: boolean;
  safety: KernelClient;
  repoRoot: string;
  dispatch: Dispatch<Action>;
  detachBackgroundResponse?: () => void;
};

/** Resolve a line with any @-referenced file content inlined as a context block. */
async function resolveLine(line: string, repoRoot: string): Promise<string> {
  const refs = parseAtRefs(line);
  const block = refs.length > 0 ? await buildContextBlock(refs, repoRoot) : "";
  return block ? `${block}\n\n${line}` : line;
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
    if (isSlashLine(text)) {
      if (deps.busy && slashHead(text) === "bg" && deps.detachBackgroundResponse) return deps.detachBackgroundResponse();
      const kind = pickerFor(text);
      return kind ? deps.openOverlay(kind) : deps.runSlash(text);
    }
    if (maybeRunShortcut(text, { safety: deps.safety, repoRoot: deps.repoRoot, note })) return;
    // While a turn runs, queue the message (with @-context resolved now) and drain it when idle.
    if (deps.busy || deps.backgroundBusy) return void resolveLine(text, deps.repoRoot).then((resolved) => deps.dispatch({ t: "enqueue", text: resolved }));
    void resolveLine(text, deps.repoRoot).then(deps.send);
  };
}
