import { useEffect, useRef, useState } from "react";
import { Ellipsis } from "lucide-react";
import { RuntimeStrip } from "./runtime-strip.js";
import type { ChatFirstState } from "./chat-first-state.js";

export function ChatWindowOptions({ state }: { state: ChatFirstState }) {
  const root = useRef<HTMLDetailsElement>(null);
  const [runtime, setRuntime] = useState(false);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) root.current.open = false;
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, []);
  return <details ref={root} className="chat-window-options" onKeyDown={(event) => {
    if (event.key === "Escape" && root.current) {
      event.stopPropagation(); root.current.open = false; root.current.querySelector("summary")?.focus();
    }
  }}>
    <summary aria-label="Workspace options" title="Workspace options"><Ellipsis size={18} aria-hidden="true" /></summary>
    <div className="chat-window-menu">
      <button type="button" aria-expanded={runtime} onClick={() => setRuntime(!runtime)}>Workspace details</button>
      {runtime ? <div className="chat-runtime"><RuntimeStrip runtime={state.data.runtime} agentModel={state.data.status?.model}
        agentProvider={state.data.status?.provider} agentRoute={state.data.status?.providerRoute} phase={state.data.phase}
        onSelect={state.data.setRuntimeHost} onAction={state.data.runRuntimeAction} /></div> : null}
      <a className="chat-classic-link" href="?shell=classic" aria-disabled={state.convo.busy || state.pending} onClick={(event) => {
        if (state.convo.busy || state.pending) { event.preventDefault(); state.setError("Stop the response before switching to Classic view."); }
      }}>Classic view</a>
    </div>
  </details>;
}
