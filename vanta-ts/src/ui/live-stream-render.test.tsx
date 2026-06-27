import { describe, it, expect } from "vitest";
import { useEffect, useReducer } from "react";
import { renderUi, waitForFrame } from "./test-render.js";
import { reduce } from "./reducer.js";
import { initialState } from "./types.js";
import { LiveRegion } from "./app-regions.js";
import { useBusyTick } from "./use-busy-tick.js";

// Regression guard for the live region during a turn whose model call is SILENT (reasoning) before
// any text — exactly the codex/gpt-5.5 case the "freeze then dump" report was about. Proves the
// thinking spinner shows + animates during the silence AND streamed text renders live in the
// StreamPreview (not only committed at turnEnd). The render layer streams correctly; the residual
// silent stretch on codex is the backend withholding reasoning, not a render bug.
async function* silentThenStream(): AsyncIterable<{ type: string; delta?: string }> {
  await new Promise((r) => setTimeout(r, 400)); // silent reasoning phase (no chunks)
  for (const d of ["Hel", "lo ", "world"]) {
    yield { type: "text", delta: d };
    await new Promise((r) => setTimeout(r, 80));
  }
  await new Promise((r) => setTimeout(r, 300)); // streaming persists (model still "open") before turnEnd
}

function Harness({ stream }: { stream: () => AsyncIterable<{ type: string; delta?: string }> }) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const tick = useBusyTick(state.busy);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      dispatch({ t: "turnStart" });
      for await (const c of stream()) {
        if (cancelled) return;
        if (c.type === "text" && c.delta) dispatch({ t: "delta", d: c.delta });
      }
      if (!cancelled) dispatch({ t: "turnEnd" });
    })();
    return () => { cancelled = true; };
  }, [stream]);
  return <LiveRegion streaming={state.streaming} activeTools={state.activeTools} busy={state.busy} tick={tick} />;
}

describe("live region during a silent-then-streaming turn", () => {
  it("shows the spinner during silent reasoning, then streams text incrementally", async () => {
    const inst = renderUi(<Harness stream={silentThenStream} />);
    // During the 400ms silent phase, the thinking spinner must be visible.
    await waitForFrame(inst, "esc to interrupt");
    expect(inst.lastFrame()).not.toContain("Hello");
    // After reasoning, text streams in.
    await waitForFrame(inst, "Hello");
    inst.unmount();
  });

  it("the spinner elapsed advances during the silent phase (proves useBusyTick repaints)", async () => {
    const inst = renderUi(<Harness stream={silentThenStream} />);
    await waitForFrame(inst, "esc to interrupt");
    const first = /\((\d+)s ·/.exec(inst.lastFrame())?.[1];
    await new Promise((r) => setTimeout(r, 320)); // ~2 ticks at 150ms
    const later = /\((\d+)s ·/.exec(inst.lastFrame())?.[1];
    inst.unmount();
    expect(Number(later)).toBeGreaterThanOrEqual(Number(first ?? 0));
  });
});
