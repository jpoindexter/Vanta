import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import type { PreparedRun, ReplayPreview, RunRecord } from "./types.js";

function postJson(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export function useRunLibrary() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRuns(await api<RunRecord[]>("/api/runs"));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (id: string, saved: boolean) => {
    const updated = await api<RunRecord>("/api/runs", postJson({ action: "save", id, saved }));
    setRuns((current) => current.map((run) => run.id === id ? updated : run));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api<{ id: string; deleted: boolean }>("/api/runs", postJson({ action: "delete", id }));
    setRuns((current) => current.filter((run) => run.id !== id));
  }, []);

  const preview = useCallback((id: string) =>
    api<ReplayPreview>("/api/runs", postJson({ action: "preview", id })), []);

  const prepare = useCallback((
    id: string,
    mode: "fork" | "replay",
    options: { prompt?: string; files?: string[]; acknowledgeDrift?: boolean } = {},
  ) => api<PreparedRun>("/api/runs", postJson({ action: mode, id, ...options })), []);

  return { runs, loading, error, refresh, save, remove, preview, prepare };
}
