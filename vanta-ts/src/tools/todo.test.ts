import { describe, expect, it } from "vitest";
import { todoTool } from "./todo.js";

const ctx = { root: "/tmp", safety: {} as never, requestApproval: async () => true };

describe("todoTool", () => {
  it("rejects ambiguous plans with more than one in-progress task", async () => {
    const result = await todoTool.execute({
      action: "write",
      items: [
        { text: "first", status: "in_progress" },
        { text: "second", status: "in_progress" },
      ],
    }, ctx);

    expect(result).toEqual({
      ok: false,
      output: "todo write allows at most one in_progress item",
    });
  });
});
