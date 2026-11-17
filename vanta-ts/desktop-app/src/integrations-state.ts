import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import type { IntegrationAction, IntegrationRecord } from "../../src/integrations/types.js";

export function useDesktopIntegrations() {
  const [items, setItems] = useState<IntegrationRecord[]>([]);
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try { setItems(await api<IntegrationRecord[]>("/api/connect/integrations")); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }, []);
  const act = useCallback(async (id: string, action: IntegrationAction) => {
    setPending(`${action}:${id}`); setError(""); setMessage("");
    try {
      const result = await api<{ integrations: IntegrationRecord[]; message: string }>("/api/connect/integrations", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action }),
      });
      setItems(result.integrations); setMessage(result.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setPending(""); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { items, pending, message, error, act };
}
