import { createElement as h } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderUi, tick, waitForFrame } from "./test-render.js";
import { McpPanel } from "./mcp-panel.js";
import type { McpServerView } from "./mcp-view.js";
import type { ElicitationRequest } from "./elicitation-dialog.js";

const DOWN = "\x1b[B";
const ENTER = "\r";
const ESC = "\x1b";

const servers: McpServerView[] = [
  {
    name: "github",
    transport: "stdio",
    status: "connected",
    tools: [{ name: "create_issue", description: "Create a GitHub issue", inputSchema: { type: "object", properties: { title: { type: "string" } } } }],
  },
  { name: "stripe", transport: "http", status: "error", error: "ECONNREFUSED", tools: [] },
];

const noop = (): void => {};

describe("McpPanel — server list", () => {
  it("lists servers with connection badges + counts", async () => {
    const inst = renderUi(h(McpPanel, { servers, onReconnect: noop, onClose: noop }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("MCP servers (2)");
    expect(out).toContain("github");
    expect(out).toContain("1 tool");
    expect(out).toContain("stripe");
    expect(out).toContain("ECONNREFUSED");
    inst.unmount();
  });

  it("shows the reconnect + close hints", async () => {
    const inst = renderUi(h(McpPanel, { servers, onReconnect: noop, onClose: noop }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("reconnect");
    expect(out).toContain("Esc close");
    inst.unmount();
  });

  it("shows an empty state when no servers are configured", async () => {
    const inst = renderUi(h(McpPanel, { servers: [], onReconnect: noop, onClose: noop }));
    await tick();
    expect(inst.lastFrame()).toContain("none configured");
    inst.unmount();
  });

  it("reconnects the selected errored server on r", async () => {
    const onReconnect = vi.fn();
    // github (connected) is first; move down to stripe (errored), then press r.
    const inst = renderUi(h(McpPanel, { servers, onReconnect, onClose: noop }));
    await tick();
    inst.input(DOWN);
    await tick();
    inst.input("r");
    await tick();
    expect(onReconnect).toHaveBeenCalledWith("stripe");
    inst.unmount();
  });

  it("does not reconnect a connected server on r", async () => {
    const onReconnect = vi.fn();
    const inst = renderUi(h(McpPanel, { servers, onReconnect, onClose: noop }));
    await tick();
    inst.input("r"); // github (connected) is selected
    await tick();
    expect(onReconnect).not.toHaveBeenCalled();
    inst.unmount();
  });

  it("closes on Esc at the top level", async () => {
    const onClose = vi.fn();
    const inst = renderUi(h(McpPanel, { servers, onReconnect: noop, onClose }));
    await tick();
    inst.input(ESC); // Ink debounces escape — flush twice
    await tick();
    await tick();
    expect(onClose).toHaveBeenCalled();
    inst.unmount();
  });
});

describe("McpPanel — drill into tools + detail", () => {
  it("shows the tool list after ⏎ on a connected server", async () => {
    const inst = renderUi(h(McpPanel, { servers, onReconnect: noop, onClose: noop }));
    await tick();
    inst.input(ENTER); // enter → github tools
    const out = await waitForFrame(inst, "github · tools (1)");
    expect(out).toContain("create_issue");
    inst.unmount();
  });

  it("shows tool detail with name/description/schema after ⏎ ⏎", async () => {
    const inst = renderUi(h(McpPanel, { servers, onReconnect: noop, onClose: noop }));
    await tick();
    inst.input(ENTER); // → tools
    await waitForFrame(inst, "github · tools (1)");
    inst.input(ENTER); // → detail
    const out = await waitForFrame(inst, "Schema"); // detail-only marker (description also shows in the tools list)
    expect(out).toContain("Create a GitHub issue");
    expect(out).toContain("title");
    inst.unmount();
  });
});

describe("McpPanel — elicitation dialog", () => {
  it("renders the dialog when a server requests input", async () => {
    const request: ElicitationRequest = { server: "github", message: "Enter your 2FA code", resolve: noop };
    const inst = renderUi(h(McpPanel, { servers, onReconnect: noop, onClose: noop, elicitation: request, onElicitationDone: noop }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("MCP input requested");
    expect(out).toContain("github");
    expect(out).toContain("Enter your 2FA code");
    inst.unmount();
  });
});
