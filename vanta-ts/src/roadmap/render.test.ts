import { describe, it, expect } from "vitest";
import { renderRoadmap } from "./render.js";
import type { Roadmap } from "./schema.js";

const fixture: Roadmap = {
  updated: "2026-06-03",
  items: [
    { id: "T1", track: "Core", title: "Shipped thing", status: "shipped", size: "S", summary: "Done.", done: "Shipped." },
    { id: "T2", track: "Core", title: "Building now", status: "building", size: "M", summary: "In progress.", done: "When done." },
    { id: "TB", track: "Core", title: "Blocked externally", status: "blocked", size: "M", summary: "Waiting.", done: "Unblocked.", tier: "pebble" },
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

  it("renders a persisted, accessible theme control", () => {
    const html = renderRoadmap(fixture);
    expect(html).toContain('id="theme-toggle"');
    expect(html).toContain('aria-label="Use light theme"');
    expect(html).toContain("prefers-color-scheme: light");
    expect(html).toContain("vanta-roadmap-theme");
    expect(html).toContain("html[data-theme=light]");
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

  it("shows active work remains in the roadmap health strip", () => {
    const html = renderRoadmap(fixture);
    expect(html).toContain("Active work remains");
    expect(html).toContain("Now 1 · Blocked 1 · Next 1 · Later 1");
    expect(html).toContain("<h2>0 parked</h2>");
    expect(html).toContain("Roadmap incomplete");
    expect(html).toContain("4 open cards remain; 0 terminally parked.");
  });

  it("shows a drained active queue with parked reason counts", () => {
    const html = renderRoadmap({
      updated: "2026-07-10",
      items: [
        { id: "S", track: "Core", title: "Done", status: "shipped", size: "S", summary: "", done: "" },
        { id: "PX", track: "Core", title: "Needs external proof", status: "parked", size: "S", summary: "", done: "", parkedReason: "external proof" },
        { id: "PD", track: "Core", title: "Duplicate card", status: "parked", size: "S", summary: "", done: "", parkedReason: "duplicate" },
      ],
    });
    expect(html).toContain("Active queue drained");
    expect(html).toContain("Now 0 · Blocked 0 · Next 0 · Later 0");
    expect(html).toContain("<h2>2 parked</h2>");
    expect(html).toContain("External Proof 1 · Duplicate 1");
    expect(html).toContain("Roadmap incomplete");
    expect(html).toContain("1 open card remains; 1 terminally parked.");
  });

  it("shows roadmap complete when every card is shipped", () => {
    const html = renderRoadmap({
      updated: "2026-07-10",
      items: [
        { id: "S", track: "Core", title: "Done", status: "shipped", size: "S", summary: "", done: "" },
      ],
    });
    expect(html).toContain("Roadmap complete");
    expect(html).toContain("No open roadmap cards remain.");
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

  it("does not call parked launchpad cards open blockers", () => {
    const phaseCards: Roadmap["items"] = [
      { id: "PCLIP-SANDBOX-AGENTS", track: "Harness", title: "Remote sandbox", status: "shipped", size: "L", summary: "", done: "" },
      { id: "BACKEND-SERVERLESS-LIVE", track: "Harness", title: "Wake remote", status: "parked", size: "L", summary: "", done: "" },
      { id: "MSG-ADAPTER-TEAMS", track: "Operator", title: "Teams", status: "parked", size: "L", summary: "", done: "" },
      { id: "RUN-ANYWHERE-TERMUX", track: "Operator", title: "Termux", status: "parked", size: "M", summary: "", done: "" },
      {
        id: "RUN-ANYWHERE-V1-RELEASE-GATE",
        track: "Operator",
        title: "Run Anywhere gate",
        status: "parked",
        size: "S",
        summary: "",
        done: "",
        after: ["PCLIP-SANDBOX-AGENTS", "BACKEND-SERVERLESS-LIVE", "MSG-ADAPTER-TEAMS", "RUN-ANYWHERE-TERMUX"],
      },
    ];
    const html = renderRoadmap({ updated: "2026-07-10", items: phaseCards });
    expect(html).toContain("Run Anywhere v1 active blockers are parked for later");
    expect(html).not.toContain("Open Run Anywhere v1 cards");
    expect(html).toContain('class="lp-parked"');
  });

  it("shows shipped count in the collapsed section header", () => {
    const html = renderRoadmap(fixture);
    expect(html).toContain("Shipped (1)");
  });

  it("renders blocked as a visible non-WIP board column", () => {
    const html = renderRoadmap(fixture);
    expect(html).toContain('data-status="blocked"');
    expect(html).toContain("Blocked externally");
    expect(html).toContain('<h2 class="ch s-blocked">Blocked');
    expect(html).not.toContain('<h2 class="ch s-blocked">Blocked <span class="wip"');
  });

  it("renders parked cards grouped by parked reason", () => {
    const html = renderRoadmap({
      updated: "2026-07-10",
      items: [
        ...fixture.items,
        { id: "PX", track: "Core", title: "Needs external proof", status: "parked", size: "S", summary: "x", done: "y", parkedReason: "external proof" },
        { id: "PD", track: "Core", title: "Duplicate card", status: "parked", size: "S", summary: "x", done: "y", parkedReason: "duplicate" },
      ],
    });
    expect(html).toContain("Parked (2)");
    expect(html).toContain("External Proof <span>1</span>");
    expect(html).toContain("Duplicate <span>1</span>");
    expect(html).toContain("Needs external proof");
    expect(html).toContain('data-parked-reason="external proof"');
  });

  it("generated filters hide empty parked groups", () => {
    const html = renderRoadmap({
      updated: "2026-07-10",
      items: [
        ...fixture.items,
        { id: "PX", track: "Core", title: "Needs external proof", status: "parked", size: "S", summary: "x", done: "y", parkedReason: "external proof" },
      ],
    });
    expect(html).toContain("var parkedGroups=document.querySelectorAll('.parked-group');");
    expect(html).toContain("g.style.display=vis?'':'none';");
    expect(html).toContain("var vis=[].some.call(s.querySelectorAll('.parked-group')");
  });

  it("omits the parked section when no cards are parked", () => {
    const html = renderRoadmap(fixture);
    expect(html).not.toContain("Parked (");
    expect(html).not.toContain('class="parked-section"');
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
