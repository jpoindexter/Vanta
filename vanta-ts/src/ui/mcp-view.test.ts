import { describe, it, expect } from "vitest";
import { serverRows, toolRows, toolDetail, canReconnect, type McpServerView } from "./mcp-view.js";

const connected = (over: Partial<McpServerView> = {}): McpServerView => ({
  name: "github",
  transport: "stdio",
  status: "connected",
  tools: [
    { name: "create_issue", description: "Create a GitHub issue\nmore detail", inputSchema: { type: "object", properties: { title: { type: "string" } } } },
    { name: "list_repos", description: "List repositories" },
  ],
  ...over,
});

const errored = (over: Partial<McpServerView> = {}): McpServerView => ({
  name: "stripe",
  transport: "http",
  status: "error",
  error: "ECONNREFUSED 127.0.0.1:9999",
  tools: [],
  ...over,
});

describe("serverRows — status badges", () => {
  it("marks a connected server ✓ with tool count + transport", () => {
    const [row] = serverRows([connected()]);
    expect(row!.badge).toBe("✓");
    expect(row!.badgeOk).toBe(true);
    expect(row!.detail).toContain("2 tools");
    expect(row!.detail).toContain("stdio");
  });

  it("singularizes a one-tool server", () => {
    const [row] = serverRows([connected({ tools: [{ name: "x" }] })]);
    expect(row!.detail).toContain("1 tool");
    expect(row!.detail).not.toContain("1 tools");
  });

  it("marks an errored server ✗ with the failure detail", () => {
    const [row] = serverRows([errored()]);
    expect(row!.badge).toBe("✗");
    expect(row!.badgeOk).toBe(false);
    expect(row!.detail).toContain("ECONNREFUSED");
  });

  it("falls back to a generic message when error is missing", () => {
    const [row] = serverRows([errored({ error: undefined })]);
    expect(row!.detail).toContain("connection failed");
  });
});

describe("toolRows — per-server tool list", () => {
  it("lists tool name + first-line description", () => {
    const rows = toolRows(connected());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "create_issue", desc: "Create a GitHub issue" });
  });

  it("returns empty for an undefined server", () => {
    expect(toolRows(undefined)).toEqual([]);
  });

  it("returns empty for a server with no tools", () => {
    expect(toolRows(errored())).toEqual([]);
  });
});

describe("toolDetail — single tool", () => {
  it("returns name, description, and pretty-printed schema", () => {
    const d = toolDetail(connected().tools[0]);
    expect(d!.name).toBe("create_issue");
    expect(d!.description).toContain("Create a GitHub issue");
    expect(d!.schema).toContain("\"title\"");
    expect(d!.schema).toContain("\n"); // pretty-printed
  });

  it("notes a missing input schema", () => {
    const d = toolDetail(connected().tools[1]);
    expect(d!.schema).toBe("(no input schema)");
  });

  it("notes a missing description", () => {
    const d = toolDetail({ name: "bare" });
    expect(d!.description).toBe("(no description)");
  });

  it("returns null for an undefined tool", () => {
    expect(toolDetail(undefined)).toBeNull();
  });
});

describe("canReconnect — only errored servers", () => {
  it("is true for an errored server", () => {
    expect(canReconnect(errored())).toBe(true);
  });
  it("is false for a connected server", () => {
    expect(canReconnect(connected())).toBe(false);
  });
  it("is false for undefined", () => {
    expect(canReconnect(undefined)).toBe(false);
  });
});
