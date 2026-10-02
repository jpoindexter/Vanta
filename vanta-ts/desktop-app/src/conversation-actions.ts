import type { ImageAttachment } from "../../src/types.js";
import { api } from "./api.js";
import { sessionHandlers } from "./conversation-sessions.js";
import { submitMessage } from "./conversation-submit.js";
import type { ConversationState,TurnCues } from "./conversation-types.js";
import { postJson } from "./request-json.js";

export function conversationHandlers(state: ConversationState, cues: TurnCues, lastFailedMessage: { current: string }) {
  function insertFile(file: string) { state.setDraft((value) => `${value} @${file}`.trimStart()); }
  async function submit(text: string, images?: ImageAttachment[], files?: string[]): Promise<boolean> {
    return submitMessage(state, text, {
      cues,
      images,
      files,
      onRecovery: (failed) => { lastFailedMessage.current = failed ? text : ""; },
    });
  }
  function localReply(text: string, content: string) {
    state.setMessages((messages) => [...messages, { role: "user", content: text }, { role: "assistant", content }]);
    state.setEvents([{ label: "Telegram setup status checked.", ok: true }]);
    state.setStreamText(() => "");
    state.setRecovery(null);
    lastFailedMessage.current = "";
    state.setDraft(() => "");
  }
  async function queue(text: string) {
    const queued = text.trim();
    if (!queued) return;
    try {
      await api<{ queued: boolean }>("/api/chat/queue", postJson({ message: queued }));
      state.setMessages((messages) => [...messages, { role: "user", content: queued }]);
      state.setDraft(() => "");
      state.setEvents([{ label: "Queued next.", ok: true }]);
    } catch (error) {
      state.setEvents([{ label: error instanceof Error ? error.message : String(error), ok: false }]);
    }
  }
  return { ...sessionHandlers(state, lastFailedMessage), submit, localReply, queue,
    retry: () => lastFailedMessage.current ? submit(lastFailedMessage.current) : Promise.resolve(), insertFile };
}
