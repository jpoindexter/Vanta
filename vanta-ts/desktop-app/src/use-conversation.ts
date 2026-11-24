import { useEffect,useRef,useState,type Dispatch,type SetStateAction } from "react";
import { api,desktopEventSourceUrl } from "./api.js";
import { conversationHandlers } from "./conversation-actions.js";
import type { TurnCues } from "./conversation-types.js";
import { postJson } from "./request-json.js";
import type { DesktopRunReceipt,EventRow,Message } from "./types.js";
import { useConversationDraft } from "./use-conversation-draft.js";
import { useTurnAdmission } from "./use-turn-admission.js";

export function useConversation(refresh: () => Promise<void>, cues: TurnCues = {}, projectRoot = "") {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [activeTitle, setActiveTitle] = useState("New session");
  const drafts = useConversationDraft(projectRoot, sessionId);
  const { setDraft, activateDraft, clearDraftFor } = drafts;
  const sessionOpenRequest = useRef(0);
  const [events, setEvents] = useState<EventRow[]>([{ label: "No tool activity yet." }]);
  const [streamText, setStreamText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<DesktopRunReceipt | null>(null);
  const lastFailedMessage = useRef("");
  const turnAdmission = useTurnAdmission((starting) => stopMessage(setEvents, starting));
  useConversationEvents(setStreamText, setEvents, turnAdmission.acknowledge);
  const handlers = conversationHandlers({ sessionId, refresh, setMessages, setSessionId, setActiveTitle, setEvents, setStreamText, setBusy, setDraft, activateDraft, clearDraftFor, setRecovery, sessionOpenRequest, turnAdmission }, cues, lastFailedMessage);
  return { sessionId, messages, activeTitle, events, streamText, busy, recovery,
    turnStarted: turnAdmission.ready, stopRequested: turnAdmission.stopping,
    ...drafts, stop: turnAdmission.stop, ...handlers };
}

function useConversationEvents(setStreamText: Dispatch<SetStateAction<string>>, setEvents: Dispatch<SetStateAction<EventRow[]>>, acknowledge: (start: { sessionId: string; requestId: string }) => void) {
  const acceptStart = useRef(acknowledge); acceptStart.current = acknowledge;
  useEffect(() => {
    const stream = new EventSource(desktopEventSourceUrl("/api/events"));
    stream.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as EventRow & { delta?: string; turnStarted?: { sessionId: string; requestId: string } };
        if (event.turnStarted) acceptStart.current(event.turnStarted);
        else if (event.delta) setStreamText((current) => current + event.delta);
        else if (event.label) setEvents((current) => [...current.filter((row) => row.label !== "thinking..."), event].slice(-200));
      } catch {
        // The final response remains authoritative if a transient SSE frame is malformed.
      }
    };
    return () => stream.close();
  }, []);
}

async function stopMessage(setEvents: (events: EventRow[]) => void, starting = false): Promise<boolean> {
  try {
    await api<{ stopping: boolean }>("/api/chat/stop", postJson({}));
    setEvents([{ label: "Stop requested by operator.", ok: false }]);
    return true;
  } catch (error) {
    if (starting && error instanceof Error && error.message === "no turn is running") return false;
    setEvents([{ label: error instanceof Error ? error.message : String(error), ok: false }]);
    return false;
  }
}
