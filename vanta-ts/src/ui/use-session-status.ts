import { useEffect, useState, type Dispatch, type MutableRefObject } from "react";
import type { Action } from "./reducer.js";
import type { RunSetup } from "../session.js";
import type { ReplState } from "../repl/types.js";
import { formatElapsed } from "./busy.js";

function useClock(): void {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

function useMcpPresent(): boolean {
  const [present, setPresent] = useState(false);
  useEffect(() => {
    void import("../mcp/mount.js")
      .then(({ readMcpConfig }) => readMcpConfig(process.env))
      .then((cfg) => setPresent(Object.keys(cfg.servers ?? {}).length > 0))
      .catch(() => {});
  }, []);
  return present;
}

function firstRalphNotice(block: string): string {
  const goal = block.match(/^Goal: (.+)$/m)?.[1] ?? "carried work";
  const next = block.match(/^Next incomplete: (.+)$/m)?.[1] ?? "next item";
  return `↻ Ralph loop progress found: ${goal.slice(0, 60)} — ${next.slice(0, 60)} · /goal resume to continue · /goal drop to discard`;
}

/** On launch, resolve the footer's working goal. A carried goal is PAUSED by
 * default (left null → footer blank; the note tells the user to /goal resume).
 * Only VANTA_GOAL_RESUME=auto auto-activates it into the footer ◇. */
function useLaunchGoal(setup: RunSetup, replStateRef: MutableRefObject<ReplState>, dispatch: Dispatch<Action>): void {
  useEffect(() => {
    const auto = process.env.VANTA_GOAL_RESUME === "auto";
    if (!auto && setup.ralphContinuity) dispatch({ t: "note", text: firstRalphNotice(setup.ralphContinuity) });
    void setup.safety.getGoals().then((gs) => {
      const g = gs.find((x) => x.status === "active");
      if (!g) return;
      if (auto) { replStateRef.current.activeGoal = g.text; return; }
      dispatch({ t: "note", text: `↻ Carried goal (paused): ${g.text.slice(0, 78)} — /goal resume to pick up · /goal clear to drop` });
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useSessionStatus(
  setup: RunSetup,
  replStateRef: MutableRefObject<ReplState>,
  dispatch: Dispatch<Action>,
): { mcp: boolean; elapsed: string } {
  const mcp = useMcpPresent();
  useClock();
  useLaunchGoal(setup, replStateRef, dispatch);
  return { mcp, elapsed: formatElapsed(Date.now() - Date.parse(replStateRef.current.started)) };
}
