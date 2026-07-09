import { describe, expect, it } from "vitest";
import {
  failBackgroundResponse,
  finishBackgroundResponse,
  formatBackgroundResponse,
  isBackgroundResponseRunning,
  startBackgroundResponse,
} from "./bg-response-cmd.js";
import type { ReplState } from "./types.js";

function state(): ReplState {
  return { sessionId: "s1", started: new Date(0).toISOString(), turnIndex: 3 };
}

describe("/bg response state", () => {
  it("starts a running background response from the active prompt", () => {
    const s = state();
    const out = startBackgroundResponse(s, "explain the roadmap", new Date(0));
    expect(out).toContain("moved to background");
    expect(isBackgroundResponseRunning(s)).toBe(true);
    expect(s.backgroundResponse).toMatchObject({ id: "bg-3", prompt: "explain the roadmap", status: "running" });
  });

  it("formats the completed response for later attach", () => {
    const s = state();
    startBackgroundResponse(s, "write a long answer", new Date(0));
    finishBackgroundResponse(s, "finished answer", new Date(1));
    expect(isBackgroundResponseRunning(s)).toBe(false);
    expect(formatBackgroundResponse(s.backgroundResponse)).toContain("finished answer");
  });

  it("records a failure as an attachable background result", () => {
    const s = state();
    startBackgroundResponse(s, "do work", new Date(0));
    failBackgroundResponse(s, "aborted", new Date(1));
    expect(formatBackgroundResponse(s.backgroundResponse)).toContain("aborted");
  });
});
