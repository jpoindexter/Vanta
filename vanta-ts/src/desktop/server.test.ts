import { describe, expect, it } from "vitest";
import { eventLabel } from "./server.js";

const args = {};

describe("desktop event labels", () => {
  it("formats tool start and end events", () => {
    expect(eventLabel({ type: "tool_start", name: "read_file", args })).toEqual({ label: "→ read_file" });
    expect(eventLabel({ type: "tool_end", name: "read_file", ok: true, output: "done" })).toEqual({ label: "✓ read_file: done", ok: true });
  });

  it("ignores raw text deltas", () => {
    expect(eventLabel({ type: "text_delta", delta: "x" })).toBeNull();
  });
});
