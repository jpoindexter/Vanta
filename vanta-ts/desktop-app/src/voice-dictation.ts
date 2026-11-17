import { useLayoutEffect, useRef, useState } from "react";
import { appendVoiceText } from "./voice-media.js";
import { VoiceSession, type VoiceState } from "./voice-session.js";

type Props = { sessionId?: string; root?: string; ready?: boolean; value: string; onChange: (value: string) => void };

export function useVoiceDictation(props: Props) {
  const [state, setState] = useState<VoiceState>({ phase: "idle", message: "" });
  const latest = useRef(props);
  latest.current = props;
  const origin = useRef("");
  const identity = JSON.stringify([props.root, props.sessionId, props.ready ?? true]);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const [session] = useState(() => new VoiceSession(setState, (text) => {
    if (origin.current !== identityRef.current) return;
    latest.current.onChange(appendVoiceText(latest.current.value, text));
  }));
  useLayoutEffect(() => {
    setState({ phase: "idle", message: "" });
    return () => session.cancel(false);
  }, [identity, session]);
  const start = () => {
    if (!latest.current.sessionId || latest.current.ready === false) return;
    origin.current = identityRef.current;
    void session.start();
  };
  return { ...state, busy: session.busy, isBusy: () => session.busy, start,
    stop: () => session.stop(), cancel: () => session.cancel() };
}

export type VoiceDictation = ReturnType<typeof useVoiceDictation>;
