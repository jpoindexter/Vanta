import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import type { DesktopMcpActionRequest, DesktopMcpPayload, DesktopMcpSummary } from "./mcp-types.js";

const emptyPayload: DesktopMcpPayload = { connectors: [], catalog: [], receipts: [] };

export function useDesktopMcp() {
  const [payload, setPayload] = useState<DesktopMcpPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setPayload(await api<DesktopMcpPayload>("/api/connect/mcp")); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, []);
  const act = useCallback(async (request: DesktopMcpActionRequest) => {
    const key = `${request.action}:${request.name ?? "desktop"}`;
    setPending(key); setError("");
    try {
      const next = await api<DesktopMcpPayload>("/api/connect/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      setPayload(next);
      if (next.authUrl) window.open(next.authUrl, "_blank", "noopener,noreferrer");
      return next;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally { setPending(""); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const summary = useMemo<DesktopMcpSummary>(() => {
    const ready = payload.connectors.filter((item) => item.enabled && item.trust === "trusted" && item.health === "ready");
    return {
      servers: ready.length,
      tools: ready.reduce((sum, item) => sum + item.tools.length, 0),
      resources: ready.reduce((sum, item) => sum + item.resources.length, 0),
    };
  }, [payload.connectors]);
  return { payload, loading, pending, error, refresh, act, summary };
}
