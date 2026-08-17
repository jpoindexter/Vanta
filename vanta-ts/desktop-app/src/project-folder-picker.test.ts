import { afterEach, describe, expect, it, vi } from "vitest";
import { acknowledgePendingDesktopProjectTask, pickDesktopProjectFolder, readPendingDesktopProjectTask, switchDesktopProjectForNewTask } from "./project-folder-picker.js";

const draft = {
  agent: "Operator",
  host: "Local Mac",
  folder: "/projects/selected",
  branch: "main",
  model: "gpt-5",
  prompt: "Continue here.",
  worktree: true,
  approvals: true,
};

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("desktop project folder bridge", () => {
  it("opens the native folder picker with the current path", async () => {
    const pickProjectFolder = vi.fn(async () => "/projects/selected");
    vi.stubGlobal("window", { vantaDesktop: { pickProjectFolder } });

    await expect(pickDesktopProjectFolder("/projects/current")).resolves.toBe("/projects/selected");
    expect(pickProjectFolder).toHaveBeenCalledWith("/projects/current");
  });

  it("fails clearly outside the desktop host", async () => {
    vi.stubGlobal("window", {});
    await expect(pickDesktopProjectFolder()).rejects.toThrow("available in the Vanta desktop app");
  });

  it("switches projects and settles the retained task only after acknowledgement", async () => {
    const switchProjectForNewTask = vi.fn(async () => ({ switching: true as const, projectRoot: draft.folder }));
    const readPendingProjectTask = vi.fn(async () => ({ id: "switch-1", targetRoot: draft.folder, draft }));
    const acknowledgePendingProjectTask = vi.fn(async () => true);
    vi.stubGlobal("window", { vantaDesktop: { switchProjectForNewTask, readPendingProjectTask, acknowledgePendingProjectTask } });

    await switchDesktopProjectForNewTask(draft);
    await expect(readPendingDesktopProjectTask()).resolves.toEqual({ id: "switch-1", targetRoot: draft.folder, draft });
    await acknowledgePendingDesktopProjectTask("switch-1");

    expect(switchProjectForNewTask).toHaveBeenCalledWith(draft);
    expect(acknowledgePendingProjectTask).toHaveBeenCalledWith("switch-1");
  });

  it("does not silently accept a failed handoff acknowledgement", async () => {
    vi.stubGlobal("window", { vantaDesktop: { acknowledgePendingProjectTask: vi.fn(async () => false) } });
    await expect(acknowledgePendingDesktopProjectTask("switch-1")).rejects.toThrow("settle the project switch handoff");
  });
});
