import { describe, expect, it } from "vitest";
import { HANDLERS } from "./handlers.js";
import { screenshotText } from "./screenshot-cmd.js";
import type { ReplCtx } from "./types.js";
import type { Message } from "../types.js";

function ctx(messages: Message[]): ReplCtx {
  return {
    convo: { messages },
    setup: { registry: { schemas: () => [] }, provider: { modelId: () => "m", contextWindow: () => 1000 } },
    dataDir: "/tmp/.vanta",
    state: { sessionId: "s1", started: new Date(0).toISOString(), turnIndex: 1 },
    env: { VANTA_TEST_CLIPBOARD: "1" },
    now: () => new Date(0),
  } as unknown as ReplCtx;
}

describe("/screenshot", () => {
  it("formats conversation history as screenshot input", () => {
    const text = screenshotText([
      { role: "user", content: "fix bug" },
      { role: "assistant", content: "done" },
    ]);
    expect(text).toContain("you");
    expect(text).toContain("vanta");
  });

  it("is registered and copies a PNG in test clipboard mode", async () => {
    const result = await HANDLERS.screenshot?.("", ctx([
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ]));
    expect(result?.output).toContain("rendered PNG");
  });
});
