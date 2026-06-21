import { describe, it, expect } from "vitest";
import {
  parseDxtManifest,
  dxtToMcpServerEntry,
  buildDxtInstallPlan,
  sanitizeDxtName,
  isDxtError,
  type DxtManifest,
} from "./dxt.js";

const validManifest = (): DxtManifest => ({
  name: "weather-mcp",
  version: "1.2.0",
  server: { command: "node", args: ["dist/index.js"], env: { API_KEY: "x" } },
});

describe("parseDxtManifest", () => {
  it("parses a valid manifest into a DxtManifest", () => {
    const r = parseDxtManifest(JSON.stringify(validManifest()));
    expect(isDxtError(r)).toBe(false);
    if (isDxtError(r)) return;
    expect(r.name).toBe("weather-mcp");
    expect(r.version).toBe("1.2.0");
    expect(r.server.command).toBe("node");
    expect(r.server.args).toEqual(["dist/index.js"]);
    expect(r.server.env).toEqual({ API_KEY: "x" });
  });

  it("parses a minimal manifest (no version/args/env)", () => {
    const r = parseDxtManifest(JSON.stringify({ name: "min", server: { command: "python" } }));
    expect(isDxtError(r)).toBe(false);
    if (isDxtError(r)) return;
    expect(r.name).toBe("min");
    expect(r.version).toBeUndefined();
    expect(r.server.command).toBe("python");
    expect(r.server.args).toBeUndefined();
    expect(r.server.env).toBeUndefined();
  });

  it("strips unknown manifest fields", () => {
    const r = parseDxtManifest(
      JSON.stringify({ name: "x", description: "extra", server: { command: "node" } }),
    );
    expect(isDxtError(r)).toBe(false);
    if (isDxtError(r)) return;
    expect(r).not.toHaveProperty("description");
  });

  it("errors on a missing server.command", () => {
    const r = parseDxtManifest(JSON.stringify({ name: "x", server: { args: ["a"] } }));
    expect(isDxtError(r)).toBe(true);
    if (isDxtError(r)) expect(r.error).toContain("invalid manifest");
  });

  it("errors on an empty server.command", () => {
    const r = parseDxtManifest(JSON.stringify({ name: "x", server: { command: "" } }));
    expect(isDxtError(r)).toBe(true);
  });

  it("errors on a missing server block", () => {
    const r = parseDxtManifest(JSON.stringify({ name: "x" }));
    expect(isDxtError(r)).toBe(true);
  });

  it("errors on a missing name", () => {
    const r = parseDxtManifest(JSON.stringify({ server: { command: "node" } }));
    expect(isDxtError(r)).toBe(true);
  });

  it("errors on a non-object (array)", () => {
    const r = parseDxtManifest(JSON.stringify([{ name: "x" }]));
    expect(isDxtError(r)).toBe(true);
    if (isDxtError(r)) expect(r.error).toContain("must be a JSON object");
  });

  it("errors on a non-object (string)", () => {
    const r = parseDxtManifest(JSON.stringify("not-a-manifest"));
    expect(isDxtError(r)).toBe(true);
  });

  it("errors on a null literal", () => {
    const r = parseDxtManifest("null");
    expect(isDxtError(r)).toBe(true);
  });

  it("errors on garbage / invalid JSON", () => {
    const r = parseDxtManifest("{ not json");
    expect(isDxtError(r)).toBe(true);
    if (isDxtError(r)) expect(r.error).toContain("invalid manifest JSON");
  });
});

describe("sanitizeDxtName", () => {
  it("keeps a safe name unchanged", () => {
    expect(sanitizeDxtName("weather-mcp")).toBe("weather-mcp");
  });

  it("strips path separators and traversal", () => {
    expect(sanitizeDxtName("../../etc/passwd")).toBe("etcpasswd");
    expect(sanitizeDxtName("a/b/c")).toBe("abc");
  });

  it("returns empty for a pure-traversal name (rejected downstream)", () => {
    expect(sanitizeDxtName("../")).toBe("");
    expect(sanitizeDxtName("..")).toBe("");
    expect(sanitizeDxtName("///")).toBe("");
  });

  it("collapses whitespace and case", () => {
    expect(sanitizeDxtName("My Cool  MCP")).toBe("my-cool-mcp");
  });
});

describe("dxtToMcpServerEntry", () => {
  it("builds the entry with the install dir as cwd", () => {
    const entry = dxtToMcpServerEntry(validManifest(), "/home/u/.vanta/extensions/weather-mcp");
    expect(entry).toEqual({
      command: "node",
      args: ["dist/index.js"],
      env: { API_KEY: "x" },
      cwd: "/home/u/.vanta/extensions/weather-mcp",
    });
  });

  it("defaults args/env to empty when the manifest omits them", () => {
    const entry = dxtToMcpServerEntry({ name: "m", server: { command: "python" } }, "/x");
    expect(entry.args).toEqual([]);
    expect(entry.env).toEqual({});
    expect(entry.cwd).toBe("/x");
  });
});

describe("buildDxtInstallPlan", () => {
  const deps = { extensionsDir: "/home/u/.vanta/extensions" };

  it("builds the install dir under extensionsDir/<sanitized name>", () => {
    const plan = buildDxtInstallPlan(validManifest(), deps);
    expect(isDxtError(plan)).toBe(false);
    if (isDxtError(plan)) return;
    expect(plan.serverName).toBe("weather-mcp");
    expect(plan.installDir).toBe("/home/u/.vanta/extensions/weather-mcp");
  });

  it("sets the mcp entry cwd to the install dir", () => {
    const plan = buildDxtInstallPlan(validManifest(), deps);
    if (isDxtError(plan)) throw new Error("expected a plan");
    expect(plan.mcpEntry.cwd).toBe(plan.installDir);
    expect(plan.mcpEntry.command).toBe("node");
  });

  it("includes a human step list naming unzip, .mcp.json write, and the trust gate", () => {
    const plan = buildDxtInstallPlan(validManifest(), deps);
    if (isDxtError(plan)) throw new Error("expected a plan");
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);
    expect(plan.steps[0]).toContain("Unzip");
    expect(plan.steps.some((s) => s.includes(".mcp.json"))).toBe(true);
    expect(plan.steps.some((s) => s.includes("trust"))).toBe(true);
  });

  it("sanitizes a hostile name into a contained install dir (no traversal)", () => {
    const plan = buildDxtInstallPlan(
      { name: "../../evil", server: { command: "node" } },
      deps,
    );
    if (isDxtError(plan)) throw new Error("expected a plan");
    expect(plan.serverName).toBe("evil");
    expect(plan.installDir).toBe("/home/u/.vanta/extensions/evil");
    expect(plan.installDir).not.toContain("..");
  });

  it("rejects a name that sanitizes to empty (no install)", () => {
    const plan = buildDxtInstallPlan({ name: "../", server: { command: "node" } }, deps);
    expect(isDxtError(plan)).toBe(true);
    if (isDxtError(plan)) expect(plan.error).toContain("unsafe extension name");
  });

  it("end-to-end: parse → plan from a manifest string", () => {
    const m = parseDxtManifest(JSON.stringify(validManifest()));
    if (isDxtError(m)) throw new Error("expected a manifest");
    const plan = buildDxtInstallPlan(m, deps);
    if (isDxtError(plan)) throw new Error("expected a plan");
    expect(plan.mcpEntry.command).toBe("node");
    expect(plan.installDir).toBe("/home/u/.vanta/extensions/weather-mcp");
  });
});
