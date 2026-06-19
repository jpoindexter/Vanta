import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { TrustDialog, previewBody, trustTitle, type TrustRequest } from "./trust-dialog.js";

describe("trust-dialog pure helpers", () => {
  it("clamps a long body to a preview with a remainder note", () => {
    const body = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    const out = previewBody(body, 12);
    expect(out.split("\n")).toHaveLength(13); // 12 + the remainder note
    expect(out).toContain("(+18 more lines)");
  });

  it("returns short bodies unchanged", () => {
    expect(previewBody("a\nb\nc", 12)).toBe("a\nb\nc");
  });

  it("titles project and mcp requests distinctly", () => {
    expect(trustTitle({ kind: "project", name: "myrepo", files: [] })).toBe('Trust project "myrepo"?');
    expect(trustTitle({ kind: "mcp", server: "weather", tools: [] })).toBe('Trust MCP server "weather"?');
  });
});

describe("TrustDialog render — project", () => {
  const req: TrustRequest = {
    kind: "project",
    name: "myrepo",
    files: [{ name: "CLAUDE.md", body: "# Rules\nbe nice" }],
  };

  it("shows the project title, file name, and a context preview", async () => {
    const ui = renderUi(<TrustDialog request={req} onDecide={() => {}} />);
    await tick();
    const frame = ui.lastFrame();
    expect(frame).toContain('Trust project "myrepo"?');
    expect(frame).toContain("CLAUDE.md");
    expect(frame).toContain("be nice");
    expect(frame).toContain("Yes, trust");
    expect(frame).toContain("No, don't trust");
    ui.unmount();
  });

  it("resolves true when '1' is pressed", async () => {
    let decided: boolean | undefined;
    const ui = renderUi(<TrustDialog request={req} onDecide={(t) => { decided = t; }} />);
    await tick();
    ui.input("1");
    await tick();
    expect(decided).toBe(true);
    ui.unmount();
  });

  it("resolves false when '2' is pressed", async () => {
    let decided: boolean | undefined;
    const ui = renderUi(<TrustDialog request={req} onDecide={(t) => { decided = t; }} />);
    await tick();
    ui.input("2");
    await tick();
    expect(decided).toBe(false);
    ui.unmount();
  });

  it("resolves false on Esc (deny default)", async () => {
    let decided: boolean | undefined;
    const ui = renderUi(<TrustDialog request={req} onDecide={(t) => { decided = t; }} />);
    await tick();
    ui.input("\x1b");
    await new Promise((r) => setTimeout(r, 130)); // Ink debounces Esc ~120ms
    await tick();
    expect(decided).toBe(false);
    ui.unmount();
  });
});

describe("TrustDialog render — mcp", () => {
  const req: TrustRequest = {
    kind: "mcp",
    server: "weather",
    tools: [
      { name: "get_forecast", description: "Fetch a forecast" },
      { name: "get_alerts" },
    ],
  };

  it("shows the server title and its tool list", async () => {
    const ui = renderUi(<TrustDialog request={req} onDecide={() => {}} />);
    await tick();
    const frame = ui.lastFrame();
    expect(frame).toContain('Trust MCP server "weather"?');
    expect(frame).toContain("get_forecast");
    expect(frame).toContain("Fetch a forecast");
    expect(frame).toContain("get_alerts");
    expect(frame).toContain("2 tool(s)");
    ui.unmount();
  });
});
