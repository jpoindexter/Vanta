import type { NewTaskDraft } from "./overlays.js";

export type PendingDesktopProjectTask = {
  id: string;
  targetRoot: string;
  draft: NewTaskDraft;
};

type DesktopProjectFolderBridge = {
  pickProjectFolder?: (currentPath?: string) => Promise<string | null>;
  switchProjectForNewTask?: (draft: NewTaskDraft) => Promise<{ switching: true; projectRoot: string }>;
  readPendingProjectTask?: () => Promise<PendingDesktopProjectTask | null>;
  acknowledgePendingProjectTask?: (id: string) => Promise<boolean>;
};

function bridge(): DesktopProjectFolderBridge | undefined {
  return (window as Window & { vantaDesktop?: DesktopProjectFolderBridge }).vantaDesktop;
}

export async function pickDesktopProjectFolder(currentPath?: string): Promise<string | null> {
  const picker = bridge()?.pickProjectFolder;
  if (!picker) throw new Error("The native project folder picker is available in the Vanta desktop app.");
  return picker(currentPath);
}

export async function switchDesktopProjectForNewTask(draft: NewTaskDraft): Promise<void> {
  const switchProject = bridge()?.switchProjectForNewTask;
  if (!switchProject) throw new Error("Project switching is available in the Vanta desktop app.");
  await switchProject(draft);
}

export async function readPendingDesktopProjectTask(): Promise<PendingDesktopProjectTask | null> {
  const readPending = bridge()?.readPendingProjectTask;
  if (!readPending) return null;
  return readPending();
}

export async function acknowledgePendingDesktopProjectTask(id: string): Promise<void> {
  const acknowledge = bridge()?.acknowledgePendingProjectTask;
  if (!acknowledge || !await acknowledge(id)) throw new Error("Vanta could not settle the project switch handoff.");
}
