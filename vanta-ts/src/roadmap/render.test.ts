import { describe, it, expect } from "vitest";
import { renderRoadmap } from "./render.js";
import type { Roadmap } from "./schema.js";

const fixture: Roadmap = {
  updated: "2026-06-03",
  items: [
    { id: "T1", track: "Core", title: "Shipped thing", status: "shipped", size: "S", summary: "Done.", done: "Shipped." },
    { id: "T2", track: "Core", title: "Building now", status: "building", size: "M", summary: "In progress.", done: "When done." },
    { id: "T3", track: "MCP", title: "Next up", status: "next", size: "S", summary: "Coming.", done: "When shipped.", tier: "rock", model: "sonnet", effort: "medium", codex: "gpt-5.4-mini" },
    { id: "T4", track: "Vision", title: "Future thing", status: "horizon", size: "L", summary: "Aspirational.", done: "Someday.", tier: "sand", model: "haiku", effort: "low" },
  ],
};

describe("renderRoadmap", () => {
  it("returns a complete HTML document", () => {
    const html = renderRoadmap(fixture);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("includes all item titles", () => {
    const html = renderRoadmap(fixture);
    for (const item of fixture.items) {
      expect(html).toContain(item.title);
    }
  });

  it("includes all done criteria", () => {
    const html = renderRoadmap(fixture);
    for (const item of fixture.items) {
      expect(html).toContain(item.done);
    }
  });

  it("includes the updated date", () => {
    const html = renderRoadmap(fixture);
    expect(html).toContain("2026-06-03");
  });

  it("renders the launch pad above the board", () => {
    const html = renderRoadmap(fixture);
    expect(html).toContain("Launch Pad");
    expect(html).toContain("Activation v1");
    expect(html.indexOf("Launch Pad")).toBeLessThan(html.indexOf('class="board"'));
  });

  it("shows launchpad status badges and activation progress separately from now slots", () => {
    const html = renderRoadmap({
      updated: "2026-07-09",
      items: [
        { id: "ACTIVATION-COLD-USER-GATE", track: "Operator", title: "Cold gate", status: "shipped", size: "S", summary: "", done: "" },
        { id: "GALLERY-SANDBOX-RECOVERY-FIXTURE", track: "Harness", title: "Sandbox fixture", status: "shipped", size: "S", summary: "", done: "" },
        { id: "USER-LANGUAGE-WORKFLOW-COPY", track: "Operator", title: "User copy", status: "shipped", size: "S", summary: "", done: "" },
        { id: "FRESH-CONTEXT-ACTIVATION-REVIEW", track: "Operator", title: "Fresh review", status: "shipped", size: "S", summary: "", done: "" },
        { id: "ROADMAP-DEPENDENCY-GUARD", track: "Harness", title: "Dependency guard", status: "shipped", size: "S", summary: "", done: "" },
        { id: "OPERATOR-HOME-V1", track: "Operator", title: "Home", status: "shipped", size: "M", summary: "", done: "" },
        { id: "CRASHLOG-DIAGNOSE", track: "Operator", title: "Crash log", status: "shipped", size: "S", summary: "", done: "" },
        { id: "SPEC-TO-APP-WIZARD", track: "Operator", title: "Spec wizard", status: "next", size: "M", summary: "", done: "" },
        { id: "VANTA-BG-RESPOND-CONTINUE", track: "Harness", title: "BG continue", status: "shipped", size: "S", summary: "", done: "" },
        {
          id: "ACTIVATION-V1-RELEASE-GATE",
          track: "Operator",
          title: "Release gate",
          status: "shipped",
          size: "S",
          summary: "",
          done: "",
          after: ["ACTIVATION-COLD-USER-GATE", "FRESH-CONTEXT-ACTIVATION-REVIEW", "CRASHLOG-DIAGNOSE", "OPERATOR-HOME-V1"],
        },
      ],
    });
    expect(html).toContain("<small>Activation gate</small>");
    expect(html).toContain("<span>5/5</span>");
    expect(html).toContain("Open Activation v1 card: SPEC-TO-APP-WIZARD.");
    expect(html).toContain('class="lp-shipped"');
    expect(html).toContain('class="lp-next"');
  });

  it("advances to Run Anywhere when its explicit release gate exists", () => {
    const phaseCards: Roadmap["items"] = [
      { id: "PCLIP-SANDBOX-AGENTS", track: "Harness", title: "Remote sandbox", status: "building", size: "L", summary: "", done: "" },
      { id: "BACKEND-SERVERLESS-LIVE", track: "Harness", title: "Wake remote", status: "horizon", size: "L", summary: "", done: "" },
      { id: "MSG-ADAPTER-TEAMS", track: "Operator", title: "Teams", status: "building", size: "L", summary: "", done: "" },
      { id: "RUN-ANYWHERE-TERMUX", track: "Operator", title: "Termux", status: "horizon", size: "M", summary: "", done: "" },
      {
        id: "RUN-ANYWHERE-V1-RELEASE-GATE",
        track: "Operator",
        title: "Run Anywhere gate",
        status: "horizon",
        size: "S",
        summary: "",
        done: "",
        after: ["PCLIP-SANDBOX-AGENTS", "BACKEND-SERVERLESS-LIVE", "MSG-ADAPTER-TEAMS", "RUN-ANYWHERE-TERMUX"],
      },
    ];
    const html = renderRoadmap({ updated: "2026-07-10", items: phaseCards });
    expect(html).toContain("Run Anywhere v1");
    expect(html).toContain("one owner can reach Vanta anywhere");
    expect(html).toContain("<small>Run-anywhere gate</small>");
    expect(html).toContain("<span>0/5</span>");
    expect(html).toContain("Remote Execution");
    expect(html).toContain("Reach Anywhere");
    expect(html).not.toContain("Activation v1:");
  });

  it("shows shipped count in the collapsed section header", () => {
    const html = renderRoadmap(fixture);
    expect(html).toContain("Shipped (1)");
  });

  it("includes track filter buttons", () => {
    const html = renderRoadmap(fixture);
    expect(html).toContain("Core");
    expect(html).toContain("MCP");
    expect(html).toContain("Vision");
  });

  it("shows model·effort and codex routing badges for tagged items", () => {
    const html = renderRoadmap(fixture);
    expect(html).toContain('class="me m-sonnet"');
    expect(html).toContain("sonnet · medium");
    expect(html).toContain('class="me cx"');
    expect(html).toContain("codex: gpt-5.4-mini");
  });

  it("groups a column by pickle-jar tier", () => {
    const html = renderRoadmap(fixture);
    expect(html).toContain("Rocks · foundational");
    expect(html).toContain("Sand · quick wins");
  });

  it("renders an untagged item without a routing badge", () => {
    const html = renderRoadmap({
      updated: "2026-06-03",
      items: [
        { id: "U", track: "T", title: "Untagged", status: "next", size: "S", summary: "x", done: "y" },
      ],
    });
    expect(html).toContain("Untagged");
    expect(html).not.toContain('class="badges"');
    expect(html).toContain("Untriaged");
  });

  it("escapes HTML in item data", () => {
    const html = renderRoadmap({
      updated: "2026-06-03",
      items: [
        {
          id: "X",
          track: "T",
          title: "<script>alert(1)</script>",
          status: "next",
          size: "S",
          summary: "",
          done: "",
        },
      ],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
