import { describe, expect, it, vi } from "vitest";
import { createAcpEventForwarder } from "./serve.js";

describe("ACP event forwarding", () => {
  it("emits a final message for non-streaming provider outcomes", () => {
    const emit = vi.fn();
    const events = createAcpEventForwarder(emit);
    events.finish("final answer");
    expect(emit).toHaveBeenCalledWith({ type: "text_complete", text: "final answer" });
  });

  it("does not duplicate an answer that already streamed", () => {
    const emit = vi.fn();
    const events = createAcpEventForwarder(emit);
    events.onEvent({ type: "text_delta", delta: "answer" });
    events.finish("answer");
    expect(emit).toHaveBeenCalledOnce();
  });
});
