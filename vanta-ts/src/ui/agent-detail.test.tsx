import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import {
  AgentsList,
  AgentDetail,
  formatToolsSummary,
  type AgentRow,
  type AgentDetailData,
} from "./agent-detail.js";

const agents: AgentRow[] = [
  { name: "researcher", status: "idle" },
  { name: "builder", status: "running" },
  { name: "verifier", status: "blocked" },
];

describe("formatToolsSummary", () => {
  it("returns 'all tools' when the allowlist is undefined (unrestricted)", () => {
    expect(formatToolsSummary(undefined)).toBe("all tools");
  });

  it("returns 'no tools' for an empty allowlist", () => {
    expect(formatToolsSummary([])).toBe("no tools");
  });

  it("lists a small allowlist with a count and singular/plural noun", () => {
    expect(formatToolsSummary(["read_file"])).toBe("1 tool: read_file");
    expect(formatToolsSummary(["read_file", "write_file"])).toBe(
      "2 tools: read_file, write_file",
    );
  });

  it("truncates to the first three named tools with an ellipsis", () => {
    expect(formatToolsSummary(["a", "b", "c", "d", "e"])).toBe("5 tools: a, b, c, …");
  });

  it("treats an all-blank allowlist as 'no tools'", () => {
    expect(formatToolsSummary(["  ", ""])).toBe("no tools");
  });

  it("strips control/ANSI bytes from operator-authored tool names", () => {
    expect(formatToolsSummary(["\x1b[31mread_file\x1b[0m"])).toBe("1 tool: read_file");
  });
});

describe("AgentsList", () => {
  it("renders each agent name with the count header", async () => {
    const inst = renderUi(h(AgentsList, { agents, selectedIndex: 0 }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Agents (3)");
    expect(out).toContain("researcher");
    expect(out).toContain("builder");
    expect(out).toContain("verifier");
    inst.unmount();
  });

  it("marks the selected row with the ❯ marker", async () => {
    const inst = renderUi(h(AgentsList, { agents, selectedIndex: 1 }));
    await tick();
    const out = inst.lastFrame();
    // The marker precedes the selected agent's name and no other.
    expect(out).toContain("❯ builder");
    expect(out).not.toContain("❯ researcher");
    expect(out).not.toContain("❯ verifier");
    inst.unmount();
  });

  it("shows each agent's status", async () => {
    const inst = renderUi(h(AgentsList, { agents, selectedIndex: 0 }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("idle");
    expect(out).toContain("running");
    expect(out).toContain("blocked");
    inst.unmount();
  });

  it("renders a clean 'no agents' row for an empty roster", async () => {
    const inst = renderUi(h(AgentsList, { agents: [], selectedIndex: 0 }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Agents (0)");
    expect(out).toContain("no agents");
    inst.unmount();
  });
});

describe("AgentDetail", () => {
  const agent: AgentDetailData = {
    name: "researcher",
    model: "claude-sonnet-4-6",
    tools: ["read_file", "web_search", "recall"],
    status: "running",
    color: "#b7a4ff",
  };

  it("renders the name, model, tools summary, and status fields", async () => {
    const inst = renderUi(h(AgentDetail, { agent }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("researcher");
    expect(out).toContain("Model");
    expect(out).toContain("claude-sonnet-4-6");
    expect(out).toContain("Tools");
    expect(out).toContain("3 tools: read_file, web_search, recall");
    expect(out).toContain("Status");
    expect(out).toContain("running");
    inst.unmount();
  });

  it("shows 'inherit' for a missing model and 'all tools' for unrestricted tools", async () => {
    const minimal: AgentDetailData = { name: "general" };
    const inst = renderUi(h(AgentDetail, { agent: minimal }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("general");
    expect(out).toContain("inherit");
    expect(out).toContain("all tools");
    expect(out).toContain("idle"); // default status
    inst.unmount();
  });
});
