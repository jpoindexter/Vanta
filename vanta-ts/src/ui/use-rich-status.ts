import { useEffect, useState } from "react";
import { join } from "node:path";
import { gitLineDelta, gitIsWorktree } from "./status-git.js";
import { composeRichSegments, type LineDelta, type RichSegment } from "./status-segments.js";

// Data hook for the rich status line. Polls the working-tree line delta (it
// changes as the agent writes files), detects a linked worktree once, and pulls
// a hook-contributed custom segment once. All sources are best-effort: a failure
// leaves the field undefined so its segment is omitted (never throws).

const POLL_MS = 5_000;

export type RichStatus = {
  lineDelta?: LineDelta;
  isWorktree?: boolean;
  custom?: string;
};

/** Worktree-ness is stable for a session, so resolve it once on mount. */
function useWorktree(repoRoot: string): boolean | undefined {
  const [isWorktree, setIsWorktree] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    void gitIsWorktree(repoRoot).then(setIsWorktree).catch(() => {});
  }, [repoRoot]);
  return isWorktree;
}

/** Line delta vs HEAD, refreshed on a slow clock so writes are reflected. */
function useLineDelta(repoRoot: string): LineDelta | undefined {
  const [delta, setDelta] = useState<LineDelta | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const refresh = (): void => { void gitLineDelta(repoRoot).then((d) => { if (alive) setDelta(d); }).catch(() => {}); };
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [repoRoot]);
  return delta;
}

/** A custom status segment from a MessageDisplay/status hook, resolved once. */
function useCustomSegment(repoRoot: string, sessionId: string): string | undefined {
  const [custom, setCustom] = useState<string | undefined>(undefined);
  useEffect(() => {
    const dataDir = join(repoRoot, ".vanta");
    void import("../hooks/shell-hooks.js")
      .then(({ fireStatusHook }) => fireStatusHook(dataDir, { sessionId }))
      .then((seg) => { if (seg) setCustom(seg); })
      .catch(() => {});
  }, [repoRoot, sessionId]);
  return custom;
}

export function useRichStatus(repoRoot: string, sessionId: string): RichStatus {
  const isWorktree = useWorktree(repoRoot);
  const lineDelta = useLineDelta(repoRoot);
  const custom = useCustomSegment(repoRoot, sessionId);
  return { isWorktree, lineDelta, custom };
}

export type FooterRichInput = { repoRoot: string; sessionId: string; sessionName?: string; vimEnabled: boolean; outputStyle?: string; compacting?: boolean };

/**
 * The footer's composed rich segments. Rate-limit data is omitted — no provider
 * exposes it yet, so that segment renders only once one supplies it; everything
 * else degrades to its empty case. Keeps app.tsx to a single wiring line.
 */
export function useFooterRich(input: FooterRichInput): RichSegment[] {
  const status = useRichStatus(input.repoRoot, input.sessionId);
  return composeRichSegments({ ...status, sessionName: input.sessionName, vimEnabled: input.vimEnabled, outputStyle: input.outputStyle, compacting: input.compacting });
}
