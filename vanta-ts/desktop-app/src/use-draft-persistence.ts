import { useCallback, useRef, useState } from "react";
import { api } from "./api.js";

/** One ordered writer to the existing Desktop draft endpoint, with visible failures. */
export function useDraftPersistence() {
  const queue = useRef<Promise<void>>(Promise.resolve());
  const generation = useRef(0);
  const failure = useRef("");
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const persist = useCallback((id: string, value: string) => {
    const revision = ++generation.current;
    setStatus("saving");
    queue.current = queue.current.then(async () => {
      await api("/api/sessions/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", id, value }) });
      failure.current = "";
      if (revision === generation.current) setStatus("saved");
    }).catch(() => {
      failure.current = "Draft could not be saved to Vanta. Keep this window open and retry before switching projects.";
      if (revision === generation.current) setStatus("error");
    });
    return queue.current;
  }, []);
  const flush = useCallback(async () => {
    await queue.current;
    if (failure.current) throw new Error(failure.current);
  }, []);
  return { persist, flush, status, error: status === "error" ? failure.current : "" };
}
