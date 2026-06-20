import { describe, expect, it } from "vitest";
import {
  formatMcpServer,
  formatMcpServers,
  resolveMcpAction,
  type McpServerState,
  type McpServerStatus,
} from "./server-control.js";

function status(state: McpServerState, over: Partial<McpServerStatus> = {}): McpServerStatus {
  return { name: "fs", state, toolCount: 0, ...over };
}

describe("resolveMcpAction — enable", () => {
  it("connects a disabled server", () => {
    const plan = resolveMcpAction(status("disabled"), "enable");
    expect(plan.plan).toBe("connect");
    expect(plan.reason).toContain("disabled → connected");
  });

  it("connects an error-state server", () => {
    const plan = resolveMcpAction(status("error", { lastError: "boom" }), "enable");
    expect(plan.plan).toBe("connect");
    expect(plan.reason).toContain("error → connected");
  });

  it("is a noop when already connected", () => {
    const plan = resolveMcpAction(status("connected", { toolCount: 3 }), "enable");
    expect(plan.plan).toBe("noop");
    expect(plan.reason).toContain("already connected");
  });
});

describe("resolveMcpAction — disable", () => {
  it("disconnects a connected server", () => {
    const plan = resolveMcpAction(status("connected", { toolCount: 3 }), "disable");
    expect(plan.plan).toBe("disconnect");
    expect(plan.reason).toContain("connected → disabled");
  });

  it("disconnects an error-state server (clears it off)", () => {
    const plan = resolveMcpAction(status("error", { lastError: "boom" }), "disable");
    expect(plan.plan).toBe("disconnect");
  });

  it("is a noop when already disabled", () => {
    const plan = resolveMcpAction(status("disabled"), "disable");
    expect(plan.plan).toBe("noop");
    expect(plan.reason).toContain("already disabled");
  });
});

describe("resolveMcpAction — reconnect", () => {
  it("reconnects from connected", () => {
    expect(resolveMcpAction(status("connected", { toolCount: 3 }), "reconnect").plan).toBe("reconnect");
  });

  it("reconnects from disabled", () => {
    expect(resolveMcpAction(status("disabled"), "reconnect").plan).toBe("reconnect");
  });

  it("reconnects from error", () => {
    expect(resolveMcpAction(status("error", { lastError: "boom" }), "reconnect").plan).toBe("reconnect");
  });

  it("names the server in the reason", () => {
    expect(resolveMcpAction(status("disabled", { name: "github" }), "reconnect").reason).toContain("github");
  });
});

describe("formatMcpServer", () => {
  it("shows the connected glyph + tool count", () => {
    expect(formatMcpServer(status("connected", { name: "fs", toolCount: 5 }))).toBe("● fs (connected, 5 tools)");
  });

  it("shows the disabled glyph", () => {
    expect(formatMcpServer(status("disabled", { name: "fs" }))).toBe("○ fs (disabled)");
  });

  it("shows the error glyph + message", () => {
    expect(formatMcpServer(status("error", { name: "fs", lastError: "exited (1)" }))).toBe(
      "✘ fs (error: exited (1))",
    );
  });

  it("falls back to 'unknown' when an error state carries no message", () => {
    expect(formatMcpServer(status("error", { name: "fs" }))).toBe("✘ fs (error: unknown)");
  });
});

describe("formatMcpServers", () => {
  it("renders one line per server", () => {
    const out = formatMcpServers([
      status("connected", { name: "fs", toolCount: 5 }),
      status("disabled", { name: "github" }),
      status("error", { name: "linear", lastError: "no token" }),
    ]);
    expect(out).toBe(
      "● fs (connected, 5 tools)\n○ github (disabled)\n✘ linear (error: no token)",
    );
  });

  it("reports an empty roster", () => {
    expect(formatMcpServers([])).toBe("(no mcp servers mounted)");
  });
});
