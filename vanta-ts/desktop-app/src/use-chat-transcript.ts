import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect,useMemo,useRef,useState } from "react";
import type { ChatThreadProps } from "./chat-thread.js";
import { preferredScrollBehavior,useLongSessionNavigation } from "./long-session-navigation.js";
import { messageFeedbackKey,type MessageFeedback } from "./message-bubble.js";
import type { Message } from "./types.js";

type ExpandedMessage = { content: string; opener: HTMLButtonElement | null } | null;

export function useChatTranscript(props: ChatThreadProps) {
  const rows = useMemo(() => props.messages.filter((m) => m.role !== "system"), [props.messages]);
  const turns = useMemo(() => rows.flatMap((message, rowIndex) => message.role === "tool" ? [] : [{ message, rowIndex }]), [rows]);
  const anchorBridge = useRef<{ get: () => { index: number; offset: number } | null; restore: (anchor: { index: number; offset: number }) => boolean }>({ get: () => null, restore: () => false });
  const navigation = useLongSessionNavigation({ sessionId: props.sessionId, contentVersion: `${rows.length}:${props.streamText.length}:${props.busy}`, getReadingAnchor: () => anchorBridge.current.get(), restoreReadingAnchor: (anchor) => anchorBridge.current.restore(anchor) });
  const transcript = useVirtualizer({
    count: turns.length,
    getScrollElement: () => navigation.scrollerRef.current,
    estimateSize: (index) => turns[index]?.message.role === "user" ? 72 : 112,
    overscan: 8,
    getItemKey: (index) => `${turns[index]?.message.role ?? "turn"}-${turns[index]?.rowIndex ?? index}`,
  });
  anchorBridge.current = {
    get: () => {
      const scroller = navigation.scrollerRef.current;
      if (!scroller) return null;
      const item = transcript.getVirtualItems().find((candidate) => candidate.end > scroller.scrollTop);
      return item ? { index: item.index, offset: scroller.scrollTop - item.start } : null;
    },
    restore: (anchor) => {
      const scroller = navigation.scrollerRef.current;
      if (!scroller) return false;
      transcript.scrollToIndex(anchor.index, { align: "start" });
      const item = transcript.getVirtualItems().find((candidate) => candidate.index === anchor.index);
      if (!item) return false;
      scroller.scrollTop = item.start + anchor.offset;
      return true;
    },
  };
  function jumpToPrompt(rowIndex: number) {
    const turnIndex = turns.findIndex((turn) => turn.rowIndex === rowIndex);
    if (turnIndex < 0) return;
    navigation.detach();
    transcript.scrollToIndex(turnIndex, { align: "center", behavior: preferredScrollBehavior() });
  }

  return { rows, turns, navigation, transcript, jumpToPrompt };
}

export function useMessageFeedback(rows: Message[]) {
  const [feedback, setFeedback] = useState<Record<string, MessageFeedback>>({});
  const [feedbackReasons, setFeedbackReasons] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<ExpandedMessage>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const next: Record<string, MessageFeedback> = {};
    const reasons: Record<string, string> = {};
    rows.forEach((message, index) => {
      if (message.role !== "assistant") return;
      const key = messageFeedbackKey(message, index);
      const stored = window.localStorage.getItem(key);
      if (stored === "helpful" || stored === "not_helpful") next[key] = stored;
      const reason = window.localStorage.getItem(`${key}:reason`);
      if (reason) reasons[key] = reason;
    });
    setFeedback(next);
    setFeedbackReasons(reasons);
  }, [rows]);

  function setMessageFeedback(key: string, value: MessageFeedback) {
    setFeedback((current) => ({ ...current, [key]: value }));
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  }
  function setMessageFeedbackReason(key: string, value: string) {
    setFeedbackReasons((current) => ({ ...current, [key]: value }));
    if (typeof window !== "undefined") window.localStorage.setItem(`${key}:reason`, value);
  }
  function closeExpanded() {
    const opener = expanded?.opener;
    setExpanded(null);
    window.requestAnimationFrame(() => opener?.focus());
  }
  return { feedback, feedbackReasons, expanded, setExpanded, setMessageFeedback, setMessageFeedbackReason, closeExpanded };
}
