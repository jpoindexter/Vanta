import type { ImageAttachment } from "../../src/types.js";
import { api } from "./api.js";
import type { ConversationState,TurnCues } from "./conversation-types.js";
import { postJson } from "./request-json.js";
import type { DesktopRunReceipt,EventRow,Message } from "./types.js";

export function latestRecoverableRun(messages: Message[]): { receipt: DesktopRunReceipt; instruction: string } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const receipt = messages[index]?.desktopRun;
    if (!receipt || receipt.status === "done") continue;
    return { receipt, instruction: receipt.checkpoint?.instruction?.trim() ?? "" };
  }
  return null;
}

type SubmitMessageOptions = {
  cues?: TurnCues;
  images?: ImageAttachment[];
  files?: string[];
  onRecovery?: (failed: boolean) => void;
};

export async function submitMessage(state: ConversationState, text: string, options: SubmitMessageOptions = {}): Promise<boolean> {
  const cues = options.cues ?? {};
  const onRecovery = options.onRecovery ?? (() => {});
  const requestId = state.turnAdmission?.begin(state.sessionId);
  cues.prime?.();
  state.setMessages((m) => [...m, { role: "user", content: text }]);
  // Clear immediately so a running turn never leaves a second copy in the
  // composer. If the turn fails, restore it only when the user has not started a
  // new draft while the request was running.
  state.setDraft(() => "");
  state.setEvents([{ label: "thinking..." }]);
  state.setStreamText(() => "");
  state.setRecovery(null);
  state.setBusy(true);
  try {
    const result = await api<{ finalText: string; events?: EventRow[]; interrupted?: boolean; receipt?: DesktopRunReceipt }>("/api/chat", postJson(chatPayload(text, options, state.sessionId, requestId)));
    const failed = result.receipt ? result.receipt.status !== "done" : !result.interrupted && Boolean(result.events?.some((event) => event.ok === false));
    state.setMessages((m) => [...m, { role: "assistant", content: result.finalText || "(no text)", ...(result.receipt ? { desktopRun: result.receipt } : {}) }]);
    state.setStreamText(() => "");
    state.setEvents(result.events?.length ? result.events : [{ label: "No tool events returned." }]);
    state.setRecovery(failed ? result.receipt ?? fallbackReceipt(text, result.finalText, result.events) : null);
    if (failed) restoreFailedDraft(state, text);
    onRecovery(failed);
    await Promise.resolve(cues.complete?.()).catch(() => undefined);
    await state.refresh();
    return !failed;
  } catch (err) {
    state.setMessages((m) => [...m, { role: "assistant", content: (err as Error).message }]);
    state.setStreamText(() => "");
    state.setEvents([{ label: (err as Error).message, ok: false }]);
    state.setRecovery(fallbackReceipt(text, (err as Error).message, [{ label: (err as Error).message, ok: false }]));
    restoreFailedDraft(state, text);
    onRecovery(true);
    return false;
  } finally {
    state.turnAdmission?.finish();
    state.setBusy(false);
  }
}

function restoreFailedDraft(state: ConversationState, text: string): void {
  state.setDraft((current) => current.length === 0 ? text : current);
}

function chatPayload(message: string, { images, files }: SubmitMessageOptions, sessionId?: string, requestId?: string) {
  return {
    message,
    ...(sessionId ? { sessionId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(images?.length ? { images } : {}),
    ...(files?.length ? { files } : {}),
  };
}

function fallbackReceipt(instruction: string, partialText: string, events: EventRow[] = []): DesktopRunReceipt {
  return {
    status: "failed",
    failureKind: "unknown",
    events,
    actions: ["retry_failed_step", "edit_request", "start_from_checkpoint"],
    checkpoint: { instruction, ...(partialText ? { partialText } : {}) },
  };
}
