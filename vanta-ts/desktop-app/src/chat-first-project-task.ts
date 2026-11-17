import { useEffect, useRef } from "react";
import { acknowledgePendingDesktopProjectTask, readPendingDesktopProjectTask, type PendingDesktopProjectTask } from "./project-folder-picker.js";
import type { NewTaskDraft } from "./overlays.js";
import type { ChatFirstState } from "./chat-first-state.js";
import type { ChatFirstActions } from "./chat-first-actions.js";

type Operations = { create: (draft: NewTaskDraft) => Promise<void>; acknowledge: (id: string) => Promise<void> };

export async function recoverProjectTask(pending: PendingDesktopProjectTask, root: string, operations: Operations): Promise<void> {
  if (pending.targetRoot.replace(/\/+$/, "") !== root.replace(/\/+$/, "")) throw new Error("The retained task does not match the active project.");
  await operations.create(pending.draft);
  await operations.acknowledge(pending.id);
}

export function taskPrompt(draft: NewTaskDraft): string {
  const context = [`Agent: ${draft.agent}`, `Host: ${draft.host}`, `Project: ${draft.folder}`, `Branch: ${draft.branch}`,
    draft.worktree ? "Use an isolated worktree." : "Work in the current checkout.",
    draft.approvals ? "Ask before consequential actions." : "Use the configured approval policy."];
  return [draft.prompt.trim(), context.join("\n")].filter(Boolean).join("\n\n");
}

export function useChatProjectTask(state: ChatFirstState, actions: ChatFirstActions) {
  const attempted = useRef(false);
  useEffect(() => {
    if (!state.ready || attempted.current) return;
    attempted.current = true;
    void readPendingDesktopProjectTask().then(async (pending) => {
      if (!pending) return;
      try {
        await recoverProjectTask(pending, state.data.status?.root ?? "", { create: actions.createTask, acknowledge: acknowledgePendingDesktopProjectTask });
      } catch (reason) {
        state.setProjectTaskRecovery({ ...pending, error: String(reason) });
        state.setTaskOpen(true);
      }
    }).catch((reason) => state.setError(`Could not restore the project task: ${String(reason)}`));
  }, [state, actions]);
}
