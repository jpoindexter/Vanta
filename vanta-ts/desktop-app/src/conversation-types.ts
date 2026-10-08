import type { DesktopRunReceipt,EventRow,Message } from "./types.js";

export type TurnCues = { prime?: () => void; complete?: () => unknown | Promise<unknown> };

export type ConversationState = {
  turnAdmission?: { begin: (sessionId?: string) => string; finish: () => void };
  sessionId?: string;
  refresh: () => Promise<void>;
  setMessages: (updater: (messages: Message[]) => Message[]) => void;
  setSessionId: (value: string) => void;
  setActiveTitle: (value: string) => void;
  setEvents: (events: EventRow[]) => void;
  setStreamText: (updater: (value: string) => string) => void;
  setBusy: (value: boolean) => void;
  setDraft: (updater: string | ((value: string) => string)) => void;
  activateDraft: (sessionId: string, isCurrent?: () => boolean) => Promise<void>;
  clearDraftFor: (sessionId: string) => Promise<void>;
  setRecovery: (value: DesktopRunReceipt | null) => void;
  sessionOpenRequest: { current: number };
};
