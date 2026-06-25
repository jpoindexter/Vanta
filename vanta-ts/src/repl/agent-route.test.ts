import { describe, it, expect } from "vitest";
import { hasAgentIntent, detectAgentName, buildAgentRouteHint } from "./agent-route.js";

describe("hasAgentIntent", () => {
  it("fires on the transcript phrasing 'talk to claude code'", () => {
    expect(hasAgentIntent("can u talk to claude code")).toBe(true);
  });
  it("fires on a verb near a known agent name", () => {
    expect(hasAgentIntent("ask claude to refactor this")).toBe(true);
    expect(hasAgentIntent("spin up codex and have it review the diff")).toBe(true);
  });
  it("fires on an agent name qualified as a CLI/session", () => {
    expect(hasAgentIntent("open the gemini cli")).toBe(true);
  });
  it("fires on a generic 'another agent' reference", () => {
    expect(hasAgentIntent("get a second opinion from another agent")).toBe(true);
  });
  it("fires on the phrasings that slipped through live (interact / agent-to-agent / drive / connect)", () => {
    expect(hasAgentIntent("why can't you interact with claude")).toBe(true);
    expect(hasAgentIntent("can you do this agent to agent")).toBe(true);
    expect(hasAgentIntent("drive claude code for me")).toBe(true);
    expect(hasAgentIntent("connect to the codex agent")).toBe(true);
  });
  it("does NOT fire on a bare model mention with no use-intent", () => {
    expect(hasAgentIntent("switch my model to gemini")).toBe(false);
    expect(hasAgentIntent("the claude 4 release notes")).toBe(false);
  });
});

describe("detectAgentName", () => {
  it("returns the named agent", () => {
    expect(detectAgentName("talk to claude code")).toBe("claude");
    expect(detectAgentName("run opencode on this")).toBe("opencode");
  });
  it("normalizes cursor → cursor-agent", () => {
    expect(detectAgentName("use the cursor agent")).toBe("cursor-agent");
    expect(detectAgentName("use cursor-agent")).toBe("cursor-agent");
  });
  it("returns null when no known agent is named", () => {
    expect(detectAgentName("get another agent to help")).toBeNull();
  });
});

describe("buildAgentRouteHint", () => {
  it("routes a named-agent request to call_agent with the agent bound", () => {
    const hint = buildAgentRouteHint("talk to claude code");
    expect(hint).toContain("call_agent");
    expect(hint).toContain('agent:"claude"');
    expect(hint).toContain("agent_session"); // offers the interactive path too
    expect(hint).toMatch(/can't|FALSE/); // busts the confabulated limitation
  });
  it("routes a generic request without binding a specific agent", () => {
    const hint = buildAgentRouteHint("get another agent to look at this");
    expect(hint).toContain("call_agent");
    expect(hint).not.toContain('agent:"');
  });
  it("returns null when there is no cross-agent intent", () => {
    expect(buildAgentRouteHint("switch my model to gemini")).toBeNull();
    expect(buildAgentRouteHint("add a license header")).toBeNull();
  });
});
