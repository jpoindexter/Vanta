import { describe, expect, it } from "vitest";
import type { RunTask } from "../schedule/runner.js";
import { buildGatewayHandle } from "./gateway-stream.js";

describe("buildGatewayHandle", () => {
  it("maps agent deltas and activity into gateway events", async () => {
    const runTask: RunTask = async (_instruction, _wake, _images, callbacks) => {
      callbacks?.onTextDelta?.("hello");
      callbacks?.onEvent?.({ type: "tool_start", name: "search", args: {} });
      return { finalText: "hello" };
    };
    const events: unknown[] = [];
    const reply = await buildGatewayHandle(runTask)("go", undefined, (event) => events.push(event));

    expect(reply).toBe("hello");
    expect(events).toEqual([
      { type: "MessageChunk", text: "hello" },
      { type: "Commentary", text: "using search" },
    ]);
  });
});
