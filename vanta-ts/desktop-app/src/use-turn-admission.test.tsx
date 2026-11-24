import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTurnAdmission } from "./use-turn-admission.js";

let tree: Root, admission: ReturnType<typeof useTurnAdmission>, stop: ReturnType<typeof vi.fn>;
function Harness() { admission = useTurnAdmission(stop); return <output>{admission.ready ? "running" : admission.stopping ? "stopping" : "starting"}</output>; }
beforeEach(async () => {
  const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
  for (const [key, value] of Object.entries({ window, document, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
  stop = vi.fn().mockResolvedValue(true); tree = createRoot(document.getElementById("root")!);
  await act(async () => tree.render(<Harness />));
});
afterEach(async () => { await act(async () => tree.unmount()); vi.unstubAllGlobals(); });

describe("server turn admission", () => {
  it("waits for the exact session and request acknowledgment, not an optimistic busy state", async () => {
    let requestId = "";
    await act(async () => { requestId = admission.begin("session-a"); });
    expect(admission.ready).toBe(false);
    await act(async () => admission.acknowledge({ sessionId: "other-session", requestId }));
    await act(async () => admission.acknowledge({ sessionId: "session-a", requestId: "stale-request" }));
    expect(admission.ready).toBe(false);
    await act(async () => admission.acknowledge({ sessionId: "session-a", requestId }));
    expect(admission.ready).toBe(true);
    await act(async () => admission.finish());
    expect(admission.ready).toBe(false);
  });
  it("retains a stop during admission and dispatches it once when the server accepts", async () => {
    stop.mockResolvedValueOnce(false);
    let requestId = "";
    await act(async () => { requestId = admission.begin("session-a"); await admission.stop(); });
    expect(stop).toHaveBeenCalledOnce(); expect(admission.stopping).toBe(true);
    await act(async () => { admission.acknowledge({ sessionId: "session-a", requestId }); admission.acknowledge({ sessionId: "session-a", requestId }); });
    expect(stop).toHaveBeenCalledTimes(2); expect(admission.ready).toBe(false);
  });
  it("clears failed startup and rejects a late acknowledgment even in the same chat", async () => {
    let staleId = "";
    await act(async () => { staleId = admission.begin("session-a"); await admission.stop(); admission.finish(); });
    expect(admission.stopping).toBe(false);
    await act(async () => { admission.begin("session-a"); admission.acknowledge({ sessionId: "session-a", requestId: staleId }); });
    expect(admission.ready).toBe(false); expect(stop).toHaveBeenCalledOnce();
  });
  it("can stop an admitted backend even when its start acknowledgment was lost", async () => {
    await act(async () => { admission.begin("session-a"); await admission.stop(); await admission.stop(); });
    expect(stop).toHaveBeenCalledOnce(); expect(admission.ready).toBe(false);
    await act(async () => admission.finish());
    expect(admission.stopping).toBe(false);
  });
});
