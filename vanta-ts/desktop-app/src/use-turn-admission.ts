import { useRef, useState } from "react";

type Start = { sessionId: string; requestId: string };
type Pending = Start & { admitted: boolean; stopping: boolean; stopSent?: boolean; stopAttempt?: Promise<boolean> };

/** Client busy is optimistic; queue controls require this exact server admission. */
export function useTurnAdmission(stopServer: (starting?: boolean) => Promise<boolean>) {
  const pending = useRef<Pending | null>(null);
  const stop = useRef(stopServer); stop.current = stopServer;
  const [ready, setReady] = useState(false);
  const [stopping, setStopping] = useState(false);
  function begin(sessionId = "") {
    const requestId = crypto.randomUUID();
    pending.current = { sessionId, requestId, admitted: false, stopping: false };
    setReady(false); setStopping(false);
    return requestId;
  }
  function finish() { pending.current = null; setReady(false); setStopping(false); }
  function acknowledge(start: Start) {
    const current = pending.current;
    if (!current || current.admitted || start.requestId !== current.requestId || start.sessionId !== current.sessionId) return;
    current.admitted = true;
    if (current.stopping) void cancel(current).then((sent) => {
      if (!sent && pending.current === current) void cancel(current);
    });
    else setReady(true);
  }
  async function requestStop() {
    const current = pending.current;
    if (!current) return;
    current.stopping = true; setStopping(true); setReady(false);
    await cancel(current);
  }
  function cancel(current: Pending): Promise<boolean> {
    if (current.stopSent) return Promise.resolve(true);
    current.stopAttempt ??= stop.current(!current.admitted).then((sent) => {
      current.stopSent = sent; return sent;
    }).finally(() => { current.stopAttempt = undefined; });
    return current.stopAttempt;
  }
  return { ready, stopping, begin, finish, acknowledge, stop: requestStop };
}
