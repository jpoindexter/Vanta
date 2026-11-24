import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import type { CapacityDimensions, ContinuitySnapshot } from "./types.js";

const post = (body: unknown): RequestInit => ({
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
type CaptureInput = { text: string; sourcePath?: string; capacity?: Partial<CapacityDimensions> };
type ItemAction = "do_it" | "show_me" | "snooze" | "skip";

export function useContinuity() {
  const [snapshot, setSnapshot] = useState<ContinuitySnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try { setSnapshot(await api<ContinuitySnapshot>("/api/continuity")); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function capture(input: CaptureInput): Promise<void> {
    setBusy(true); setError("");
    try {
      const result = await api<{ snapshot: ContinuitySnapshot }>("/api/continuity", post({ action: "capture", ...input }));
      setSnapshot(result.snapshot);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function act(id: string | undefined, action: ItemAction | "off", options: { until?: string; scope?: "session" | "pattern" | "global" } = {}): Promise<void> {
    setBusy(true); setError("");
    try {
      const result = await api<ContinuitySnapshot | { snapshot: ContinuitySnapshot }>("/api/continuity", post({ action, ...(id ? { id } : {}), ...options }));
      setSnapshot("snapshot" in result ? result.snapshot : result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return { snapshot, busy, error, refresh, capture, act };
}
