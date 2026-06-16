import { useEffect, useState, type Dispatch } from "react";
import type { Action } from "./reducer.js";
import type { RunSetup } from "../session.js";
import { formatElapsed } from "./busy.js";

function useActiveGoal(safety: RunSetup["safety"], busy: boolean): string | null {
  const [goal, setGoal] = useState<string | null>(null);
  useEffect(() => {
    void safety.getGoals().then((gs) => setGoal(gs.find((g) => g.status === "active")?.text ?? null)).catch(() => {});
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  return goal;
}

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

export function useSessionStatus(
  setup: RunSetup,
  busy: boolean,
  startedIso: string,
  dispatch: Dispatch<Action>,
): { goal: string | null; mcp: boolean; elapsed: string } {
  const goal = useActiveGoal(setup.safety, busy);
  const mcp = useMcpPresent();
  useClock();
  useEffect(() => {
    if (process.env.VANTA_GOAL_RESUME === "auto") return;
    if (setup.ralphContinuity) dispatch({ t: "note", text: firstRalphNotice(setup.ralphContinuity) });
    void setup.safety.getGoals().then((gs) => {
      const g = gs.find((x) => x.status === "active");
      if (g) dispatch({ t: "note", text: `↻ Carried goal (paused): ${g.text.slice(0, 78)} — /goal resume to pick up · /goal clear to drop` });
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { goal, mcp, elapsed: formatElapsed(Date.now() - Date.parse(startedIso)) };
}
