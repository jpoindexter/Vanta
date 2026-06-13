import { type Dispatch } from "react";
import { isSlashLine } from "./slash.js";
import { maybeRunShortcut } from "./shortcuts.js";
import { parseAtRefs, buildContextBlock } from "./at.js";
import type { SafetyClient } from "../safety-client.js";
import type { Action } from "./reducer.js";

// The composer submit router for the v2 UI. One place decides what a submitted
// line means: slash command, !/# prefix, or a plain message (with @-file content
// inlined). Rebuilt every render so it closes over fresh `busy` with no memo.

export type SubmitDeps = {
  runSlash: (line: string) => void;
  send: (text: string) => void;
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

export function useSubmit(deps: SubmitDeps): (text: string) => void {
  const note = (text: string): void => deps.dispatch({ t: "note", text });
  return (text: string): void => {
    if (isSlashLine(text)) return deps.runSlash(text);
    if (maybeRunShortcut(text, { safety: deps.safety, repoRoot: deps.repoRoot, note })) return;
    if (deps.busy) return note("  · still working — send again when ready");
    void sendWithContext(text, deps.repoRoot, deps.send);
  };
}
