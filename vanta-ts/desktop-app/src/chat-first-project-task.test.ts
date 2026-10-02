import { describe, expect, it } from "vitest";
import { recoverProjectTask, taskPrompt } from "./chat-first-project-task.js";

const draft = { agent: "Operator", host: "Local Mac", folder: "/proof", branch: "main", model: "proof", prompt: "Keep my request", worktree: true, approvals: true };
const pending = { id: "handoff", targetRoot: "/proof", draft };

describe("chat-first project task handoff", () => {
  it("stages the retained task before acknowledging it", async () => {
    const events: string[] = [];
    await recoverProjectTask(pending, "/proof/", { create: async (value) => { events.push(value.prompt); }, acknowledge: async (id) => { events.push(id); } });
    expect(events).toEqual(["Keep my request", "handoff"]);
  });
  it("does not acknowledge a failed task or wrong project", async () => {
    let acknowledgements = 0;
    const operations = { create: async () => { throw new Error("save failed"); }, acknowledge: async () => { acknowledgements++; } };
    await expect(recoverProjectTask(pending, "/wrong", operations)).rejects.toThrow("active project");
    await expect(recoverProjectTask(pending, "/proof", operations)).rejects.toThrow("save failed");
    expect(acknowledgements).toBe(0);
  });
  it("retains task context without sending it", () => {
    expect(taskPrompt(draft)).toContain("Keep my request\n\nAgent: Operator");
    expect(taskPrompt(draft)).toContain("Ask before consequential actions.");
    expect(taskPrompt(draft)).toContain("Use an isolated worktree.");
  });
});
