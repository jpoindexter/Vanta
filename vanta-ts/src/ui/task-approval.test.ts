import { describe, expect, it } from "vitest";
import { canContinueTask, TaskApprovalScope } from "./task-approval.js";
import { requestApprovalWithTaskScope, type Pending } from "./use-agent.js";

const edit = { toolName: "edit_file", action: "edit file src/app.ts", reason: "file change" };

describe("TaskApprovalScope", () => {
  it("reuses one explicit task grant for another reversible action from the same tool", () => {
    const scope = new TaskApprovalScope();
    expect(scope.grant(edit)).toBe(true);
    expect(scope.allows({ ...edit, action: "edit file src/state.ts" })).toBe(true);
  });

  it("clears the grant at the next user turn", () => {
    const scope = new TaskApprovalScope();
    scope.grant(edit);
    scope.beginTurn();
    expect(scope.allows(edit)).toBe(false);
  });

  it.each([
    { toolName: "shell_cmd", action: "run shell command: git push", reason: "irreversible" },
    { toolName: "write_file", action: "overwrite existing file .env", reason: "file already exists" },
    { toolName: "payment_transaction", action: "send payment", reason: "fresh transaction", fresh: true },
  ])("never reuses a task grant for a one-way boundary: $action", (input) => {
    expect(canContinueTask(input)).toBe(false);
    const scope = new TaskApprovalScope();
    expect(scope.grant(input)).toBe(false);
    expect(scope.allows(input)).toBe(false);
  });

  it("can reuse a clearly read-only shell approval but not an unknown command", () => {
    expect(canContinueTask({ toolName: "shell_cmd", action: "run shell command: git status --short", reason: "shell" })).toBe(true);
    expect(canContinueTask({ toolName: "shell_cmd", action: "run shell command: npm publish", reason: "shell" })).toBe(false);
  });

  it("allows bounded in-project overwrite work after one go-ahead but not traversal", () => {
    expect(canContinueTask({ toolName: "write_file", action: "Overwrite existing file src/app.ts", reason: "file already exists" })).toBe(true);
    expect(canContinueTask({ toolName: "write_file", action: "Overwrite existing file ../outside.txt", reason: "file already exists" })).toBe(false);
  });

  it("one go-ahead resolves the first prompt and suppresses the next matching task prompt", async () => {
    const scope = new TaskApprovalScope();
    const prompts: Pending[] = [];
    const first = requestApprovalWithTaskScope(scope, (pending) => { if (pending) prompts.push(pending); }, edit.action, edit.reason, edit.toolName);
    expect(prompts).toHaveLength(1);
    prompts[0]!.grantTask?.();
    prompts[0]!.resolve(true);
    await expect(first).resolves.toBe(true);

    await expect(requestApprovalWithTaskScope(
      scope,
      (pending) => { if (pending) prompts.push(pending); },
      "edit file src/second.ts",
      "file change",
      "edit_file",
    )).resolves.toBe(true);
    expect(prompts).toHaveLength(1);
  });

  it("a task grant never suppresses a later one-way prompt", () => {
    const scope = new TaskApprovalScope();
    scope.grant(edit);
    const prompts: Pending[] = [];
    void requestApprovalWithTaskScope(
      scope,
      (pending) => { if (pending) prompts.push(pending); },
      "overwrite existing file .env",
      "credential file",
      "write_file",
    );
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.canContinueTask).toBe(false);
  });
});
