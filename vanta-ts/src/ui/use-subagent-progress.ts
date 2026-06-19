import { useEffect, useState } from "react";
import { progressStore, type SubagentProgress } from "../subagent/progress-store.js";

// VANTA-AGENT-SUMMARY — footer hook. Subscribes to the in-process sub-agent
// progress store and re-renders when a running worker's summary changes. The
// store is process-local and best-effort; with no running sub-agent the hook
// returns an empty list and the footer pill renders nothing.

/** The running sub-agents and their latest summaries, freshest first. */
export function useSubagentProgress(): SubagentProgress[] {
  const [running, setRunning] = useState<SubagentProgress[]>(() => progressStore().snapshot());
  useEffect(() => {
    const store = progressStore();
    const sync = (): void => setRunning(store.snapshot());
    sync(); // catch anything that started between render and subscribe
    return store.subscribe(sync);
  }, []);
  return running;
}
