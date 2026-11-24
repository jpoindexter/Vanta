import { useEffect, useRef, useState } from "react";

type Handlers = { send: (text: string) => void; keepAsDraft: (text: string) => void };

export type EarlyComposer = {
  text: string;
  queued: boolean;
  onChange: (text: string) => void;
  /** Hold the message; it is sent the moment the runtime is ready. */
  onQueue: (text: string) => void;
};

/**
 * Typing and sending are allowed before the runtime connects. Text typed early is
 * kept here (not in the session draft, which has no session yet) and either sent
 * on connect or handed to the real draft if the user never pressed send.
 */
export function useEarlyComposer(ready: boolean, handlers: Handlers): EarlyComposer {
  const [text, setText] = useState("");
  const [queued, setQueued] = useState(false);
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    if (!ready || !text) return;
    if (queued) latest.current.send(text);
    else latest.current.keepAsDraft(text);
    setText(""); setQueued(false);
  }, [ready]);
  return {
    text, queued,
    onChange: (next) => { setText(next); setQueued(false); },
    onQueue: (next) => { setText(next); setQueued(next.trim().length > 0); },
  };
}
