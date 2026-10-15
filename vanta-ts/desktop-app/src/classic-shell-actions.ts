import { isTelegramSetupQuestion,parseDesktopSetupCommand } from "../../src/setup/telegram-intent.js";
import type { ClassicState } from "./classic-shell-state.js";
import type { NewTaskDraft } from "./overlays.js";
import { acknowledgePendingDesktopProjectTask,switchDesktopProjectForNewTask } from "./project-folder-picker.js";
import type { useConversation } from "./state.js";
import type { AccessMode,DesktopView,PreparedRun } from "./types.js";
import { withProjectAttachments } from "./use-composer-attachments.js";

const ACCESS_MODE_CYCLE: AccessMode[] = ["auto", "full", "ask", "approve", "plan"];

export function classicShellActions(state: ClassicState) {
  const navigation = classicNavigation(state);
  return { ...navigation, submitWork: submitWorkAction(state, navigation.openTelegramSetup),
    createNewTask: createTaskAction(state), runPrepared: runPreparedAction(state) };
}

function classicNavigation(state: ClassicState) {
  const { data, setConnectTarget, setView, setMobilePanel, conversationReady, setNewTaskOpen, setInspectorOpen } = state;
  function cycleAccessMode() {
    const current = data.status?.accessMode ?? "approve";
    const index = ACCESS_MODE_CYCLE.indexOf(current);
    const next = ACCESS_MODE_CYCLE[(index + 1 + ACCESS_MODE_CYCLE.length) % ACCESS_MODE_CYCLE.length] ?? "auto";
    void data.setAccessMode(next);
  }
  function openTelegramSetup() {
    setConnectTarget({ key: Date.now(), section: "messaging", messagingId: "telegram" });
    setView("connect");
    setMobilePanel("work");
  }
  function openNewTask() {
    if (!conversationReady) return;
    setNewTaskOpen(true);
  }
  function openView(next: DesktopView) {
    setView(next);
    setInspectorOpen(false);
    setMobilePanel("work");
  }
  return { cycleAccessMode, openTelegramSetup, openNewTask, openView };
}

function submitWorkAction(state: ClassicState, openTelegramSetup: () => void) {
  const { conversationReady, data, convo, setConnectTarget, setView, setMobilePanel, attachments, runLibrary } = state;
  async function submitWork(text: string) {
    if (!conversationReady) return;
    const setupTarget = parseDesktopSetupCommand(text);
    if (setupTarget) {
      if (setupTarget.section === "model") data.openModelPicker();
      else if (setupTarget.section === "unknown") convo.localReply(text, `Unknown setup section: ${setupTarget.value}.\nUse /setup, /setup model, /setup messaging, /setup telegram, or /setup mcp.`);
      else {
        setConnectTarget({
          key: Date.now(),
          section: setupTarget.section,
          ...(setupTarget.section === "messaging" && setupTarget.platformId ? { messagingId: setupTarget.platformId } : {}),
        });
        setView("connect");
        setMobilePanel("work");
      }
      return;
    }
    if (!isTelegramSetupQuestion(text)) {
      const sent = await convo.submit(withProjectAttachments(text, attachments.files), attachments.images, attachments.files);
      if (sent) {
        attachments.clear();
        await runLibrary.refresh();
      }
      return;
    }
    try {
      const status = await data.telegramSetupStatus();
      convo.localReply(text, [status.title, status.detail, `${status.action.label}: ${status.action.command}`].join("\n"));
      openTelegramSetup();
    } catch (error) {
      convo.localReply(text, `Telegram setup status is unavailable.\nRetry: ${(error as Error).message}`);
    }
  }

  return submitWork;
}

function createTaskAction(state: ClassicState) {
  const { conversationReady, data, convo, setNewTaskOpen, setView, projectTaskRecovery, setProjectTaskRecovery } = state;
  async function createNewTask(draft: NewTaskDraft) {
    if (!conversationReady) throw new Error("Wait for the current project to finish loading.");
    if (comparableProjectPath(draft.folder) !== comparableProjectPath(data.status?.root)) {
      await switchDesktopProjectForNewTask(draft);
      return;
    }
    await createTask(draft, convo, () => { setNewTaskOpen(false); setView("work"); });
    if (projectTaskRecovery) await acknowledgePendingDesktopProjectTask(projectTaskRecovery.id);
    setProjectTaskRecovery(null);
  }

  return createNewTask;
}

function runPreparedAction(state: ClassicState) {
  const { attachments, convo, setView, setMobilePanel, runLibrary } = state;
  return async (prepared: PreparedRun) => {
          attachments.clear();
          for (const file of prepared.files) attachments.addFile(file);
          await convo.openSession(prepared.sessionId);
          convo.setDraft(prepared.draft);
          setView("work");
          setMobilePanel("work");
          if (prepared.lineage.mode === "replay") {
            const sent = await convo.submit(withProjectAttachments(prepared.prompt, prepared.files), undefined, prepared.files);
            if (sent) attachments.clear();
          }
          await runLibrary.refresh();

  };
}

export function comparableProjectPath(value: string | undefined): string {
  if (!value) return "";
  return value.length > 1 ? value.replace(/\/+$/, "") : value;
}


export async function createTask(draft: NewTaskDraft, convo: ReturnType<typeof useConversation>, close: () => void) {
  await convo.newSession();
  const context = [`Agent: ${draft.agent}`, `Host: ${draft.host}`, `Project: ${draft.folder}`, `Branch: ${draft.branch}`, draft.worktree ? "Use an isolated worktree." : "Work in the current checkout.", draft.approvals ? "Ask before consequential actions." : "Use the configured approval policy."].join("\n");
  convo.setDraft(`${draft.prompt.trim()}${draft.prompt.trim() ? "\n\n" : ""}${context}`);
  close();
}

export type ClassicActions = ReturnType<typeof classicShellActions>;
