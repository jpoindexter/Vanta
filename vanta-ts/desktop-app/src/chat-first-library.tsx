import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { RunLibraryPanel } from "./run-library.js";
import { useRunLibrary } from "./run-library-state.js";
import { WorkflowRunLedger } from "./workflow-runs.js";
import { ChatSessionManager } from "./chat-first-session-manager.js";
import type { ChatFirstState } from "./chat-first-state.js";
import type { ChatFirstActions } from "./chat-first-actions.js";
import type { PreparedRun } from "./types.js";

export async function restorePreparedRun(state: ChatFirstState, prepared: PreparedRun) {
  await state.convo.openSession(prepared.sessionId);
  state.attachments.clear();
  for (const file of prepared.files) state.attachments.addFile(file);
  state.convo.setDraft(prepared.draft); state.setView("work");
}

export function ChatFirstLibrary({ state, actions }: { state: ChatFirstState; actions: ChatFirstActions }) {
  const [section, setSection] = useState<"chats" | "runs" | "workflows">("runs");
  const library = useRunLibrary();
  const locked = state.convo.busy || state.pending || !state.ready || Boolean(state.attachments.files.length || state.attachments.images.length);
  const controller = { ...library, prepare: async (...args: Parameters<typeof library.prepare>) => {
    if (locked) throw new Error("Stop the current response and clear attached context before preparing another run.");
    await state.convo.flushDraft();
    return library.prepare(...args);
  } };
  return <section className="chat-workspace" aria-labelledby="chat-library-title">
    <header className="chat-workspace-heading"><div><h1 id="chat-library-title">Library</h1><p>Find a conversation, reuse a run, or inspect workflow history.</p></div>
      <button className="chat-icon" type="button" aria-label="Refresh library" onClick={() => void library.refresh()}><RefreshCw size={18} /></button></header>
    <nav className="chat-section-tabs" aria-label="Library sections">
      <button type="button" aria-pressed={section === "chats"} onClick={() => setSection("chats")}>Chats</button>
      <button type="button" aria-pressed={section === "runs"} onClick={() => setSection("runs")}>Reusable runs</button>
      <button type="button" aria-pressed={section === "workflows"} onClick={() => setSection("workflows")}>Workflows</button>
    </nav>
    {section === "chats" ? <ChatSessionManager state={state} actions={actions} /> : null}
    {section === "runs" ? <><p className="chat-panel-note">Fork and replay prepare a new draft. Nothing runs until you send it; replay requires fresh approvals.</p>
      <RunLibraryPanel controller={controller} onPrepared={(prepared) => restorePreparedRun(state, prepared)} /></> : null}
    {section === "workflows" ? <WorkflowRunLedger /> : null}
  </section>;
}
