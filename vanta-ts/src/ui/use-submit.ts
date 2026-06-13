import { type Dispatch } from "react";
import { isSlashLine, slashHead } from "./slash.js";
import { maybeRunShortcut } from "./shortcuts.js";
import { parseAtRefs, buildContextBlock } from "./at.js";
import { PICKER_KINDS, type OverlayKind } from "./overlays.js";
import type { SafetyClient } from "../safety-client.js";
import type { Action } from "./reducer.js";

// The composer submit router for the v2 UI. One place decides what a submitted
// line means: slash command, !/# prefix, or a plain message (with @-file content
// inlined). Rebuilt every render so it closes over fresh `busy` with no memo.

export type SubmitDeps = {
  runSlash: (line: string) => void;
  send: (text: string) => void;
  openOverlay: (kind: OverlayKind) => void;
  busy: boolean;
  safety: SafetyClient;
  repoRoot: string;
  dispatch: Dispatch<Action>;
};

/** Inline any @-referenced file content as a context block, then send. */
async function sendWithContext(line: string, repoRoot: string, send: (t: string) => void): Promise<void> {
  const refs = parseAtRefs(line);
  const block = refs.length > 0 ? await buildContextBlock(refs, repoRoot) : "";
  send(block ? `${block}\n\n${line}` : line);
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
      const kind = pickerFor(text);
      return kind ? deps.openOverlay(kind) : deps.runSlash(text);
    }
    if (maybeRunShortcut(text, { safety: deps.safety, repoRoot: deps.repoRoot, note })) return;
    if (deps.busy) return note("  · still working — send again when ready");
    void sendWithContext(text, deps.repoRoot, deps.send);
  };
}
