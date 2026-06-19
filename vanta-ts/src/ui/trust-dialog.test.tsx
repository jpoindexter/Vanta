import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import {
  TrustDialog, previewBody, lineCount, fileSummary, trustTitle,
  projectKeyAction, mcpKeyAction, type TrustRequest,
} from "./trust-dialog.js";

// Multiple flushes: input → useInput → setState → re-render takes more than one tick.
const ticks = async (n = 6): Promise<void> => { for (let i = 0; i < n; i++) await tick(); };

const noKey = { escape: false, return: false, upArrow: false, downArrow: false };

describe("projectKeyAction (pure)", () => {
  it("maps y/Enter→trust, n→deny, v→toggle, Esc→deny, else ignore", () => {
    expect(projectKeyAction("y", noKey)).toBe("trust");
    expect(projectKeyAction("Y", noKey)).toBe("trust");
    expect(projectKeyAction("", { ...noKey, return: true })).toBe("trust");
    expect(projectKeyAction("n", noKey)).toBe("deny");
    expect(projectKeyAction("", { ...noKey, escape: true })).toBe("deny");
    expect(projectKeyAction("v", noKey)).toBe("toggleView");
    expect(projectKeyAction("x", noKey)).toBeUndefined();
  });
});

describe("mcpKeyAction (pure)", () => {
  it("maps arrows to move and Enter/number to the selected decision", () => {
    expect(mcpKeyAction("", { ...noKey, upArrow: true }, 0)).toBe("up");
    expect(mcpKeyAction("", { ...noKey, downArrow: true }, 0)).toBe("down");
    expect(mcpKeyAction("", { ...noKey, return: true }, 0)).toBe("trust"); // choice 0 = trust
    expect(mcpKeyAction("", { ...noKey, return: true }, 1)).toBe("deny"); // choice 1 = deny
    expect(mcpKeyAction("1", noKey, 0)).toBe("trust");
    expect(mcpKeyAction("2", noKey, 0)).toBe("deny");
    expect(mcpKeyAction("", { ...noKey, escape: true }, 0)).toBe("deny");
    expect(mcpKeyAction("z", noKey, 0)).toBeUndefined();
  });
});

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

  it("counts non-empty lines, trimming surrounding whitespace", () => {
    expect(lineCount("a\nb\nc")).toBe(3);
    expect(lineCount("\n\n a \n b \n\n")).toBe(2);
    expect(lineCount("   ")).toBe(0);
    expect(lineCount("")).toBe(0);
  });

  it("summarizes a file as `name (N lines)` and pluralizes correctly", () => {
    expect(fileSummary({ name: "CLAUDE.md", body: "a\nb\nc" })).toBe("CLAUDE.md (3 lines)");
    expect(fileSummary({ name: "VANTA.md", body: "solo" })).toBe("VANTA.md (1 line)");
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

  it("defaults to a names + line-counts summary, not the file body", async () => {
    const ui = renderUi(<TrustDialog request={req} onDecide={() => {}} />);
    await tick();
    const frame = ui.lastFrame();
    expect(frame).toContain('Trust project "myrepo"?');
    expect(frame).toContain("CLAUDE.md (2 lines)");
    expect(frame).not.toContain("be nice"); // body is gated behind view
    expect(frame).toContain("[y] trust");
    expect(frame).toContain("[v] view");
    ui.unmount();
  });

  it("reveals the file preview after pressing 'v'", async () => {
    const ui = renderUi(<TrustDialog request={req} onDecide={() => {}} />);
    await tick();
    ui.input("v");
    await ticks();
    expect(ui.lastFrame()).toContain("be nice");
    ui.unmount();
  });

  it("resolves true when 'y' is pressed", async () => {
    let decided: boolean | undefined;
    const ui = renderUi(<TrustDialog request={req} onDecide={(t) => { decided = t; }} />);
    await tick();
    ui.input("y");
    await tick();
    expect(decided).toBe(true);
    ui.unmount();
  });

  it("resolves false when 'n' is pressed", async () => {
    let decided: boolean | undefined;
    const ui = renderUi(<TrustDialog request={req} onDecide={(t) => { decided = t; }} />);
    await tick();
    ui.input("n");
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
