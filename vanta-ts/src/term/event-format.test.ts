import { describe, it, expect } from "vitest";
import {
  defaultEventFormatter,
  jsonEventFormatter,
  resolveEventFormatter,
  registerEventFormatter,
} from "./event-format.js";
import type { StreamEvent } from "../agent/agent-types.js";

const toolEnd: StreamEvent = { type: "tool_end", name: "read_file", ok: true, output: "hello world" };
const note: StreamEvent = { type: "note", text: "heads up" };

describe("defaultEventFormatter", () => {
  it("labels tool_start / tool_end / note and drops unknowns", () => {
    expect(defaultEventFormatter.format({ type: "tool_start", name: "grep", args: {} })).toEqual({ label: "→ grep" });
    expect(defaultEventFormatter.format(toolEnd)).toEqual({ label: "✓ read_file: hello world", ok: true });
    expect(defaultEventFormatter.format(note)).toEqual({ label: "note: heads up" });
  });
});

describe("jsonEventFormatter", () => {
  it("emits a compact JSON label carrying ok", () => {
    const r = jsonEventFormatter.format(toolEnd);
    expect(r?.ok).toBe(true);
    expect(JSON.parse(r!.label)).toEqual({ event: "tool_end", name: "read_file", ok: true, output: "hello world" });
  });
  it("emits JSON for tool_start and note", () => {
    expect(JSON.parse(jsonEventFormatter.format({ type: "tool_start", name: "grep", args: {} })!.label)).toEqual({
      event: "tool_start",
      name: "grep",
    });
    expect(JSON.parse(jsonEventFormatter.format(note)!.label)).toEqual({ event: "note", text: "heads up" });
  });
});

describe("resolveEventFormatter — mode selection via the port", () => {
  it("defaults to the label formatter when VANTA_EVENT_FORMAT is unset", () => {
    expect(resolveEventFormatter({})).toBe(defaultEventFormatter);
  });
  it("selects the json mode", () => {
    expect(resolveEventFormatter({ VANTA_EVENT_FORMAT: "json" })).toBe(jsonEventFormatter);
  });
  it("falls back to the default for an unknown mode", () => {
    expect(resolveEventFormatter({ VANTA_EVENT_FORMAT: "nope" })).toBe(defaultEventFormatter);
  });
  it("a new output mode plugs in by REGISTRATION, not by editing resolve()", () => {
    const custom = { format: () => ({ label: "custom" }) };
    registerEventFormatter("evt-test-mode", custom);
    expect(resolveEventFormatter({ VANTA_EVENT_FORMAT: "evt-test-mode" })).toBe(custom);
  });
});
