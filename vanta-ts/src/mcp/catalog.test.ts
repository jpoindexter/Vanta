import { describe, it, expect } from "vitest";
import { MCP_CATALOG, catalogEntry, buildInstallSpec, installIntoConfig, type McpCatalogEntry } from "./catalog.js";

// EXT-MCP-CATALOG — vetted manifest + install path; mutating tools opt-in.

describe("catalog", () => {
  it("every entry is read-mostly by default: no default tool is also an opt-in (mutating) tool", () => {
    for (const e of MCP_CATALOG) {
      const optIn = new Set(e.optInTools ?? []);
      for (const t of e.defaultTools) expect(optIn.has(t)).toBe(false);
      expect(e.command || e.url).toBeTruthy(); // a transport is declared
    }
  });

  it("catalogEntry looks up by name", () => {
    expect(catalogEntry("github")?.description).toContain("GitHub");
    expect(catalogEntry("nope")).toBeUndefined();
  });

  it("captures Home Assistant as a read-mostly optional MCP mount", () => {
    const ha = catalogEntry("homeassistant");
    expect(ha?.command).toBe("mcp-proxy");
    expect(ha?.args).toContain("http://homeassistant.local:8123/api/mcp");
    expect(ha?.defaultTools).toEqual(["GetLiveContext"]);
    expect(ha?.optInTools).toContain("HassTurnOn");
    expect(ha?.authEnv).toEqual(["API_ACCESS_TOKEN"]);
  });
});

describe("buildInstallSpec", () => {
  const gh = catalogEntry("github")!;

  it("installs only the read-mostly default tools by default", () => {
    const r = buildInstallSpec(gh);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spec.tools).toEqual(gh.defaultTools);
      // A mutating tool is NOT mounted unless opted in.
      expect(r.spec.tools).not.toContain("create_issue");
      // Auth env is scaffolded as ${VAR} placeholders.
      expect(r.spec.env).toEqual({ GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_PERSONAL_ACCESS_TOKEN}" });
    }
  });

  it("adds an explicitly opted-in mutating tool to the allowlist", () => {
    const r = buildInstallSpec(gh, ["create_issue"]);
    expect(r.ok && r.spec.tools?.includes("create_issue")).toBe(true);
  });

  it("rejects a tool that is not a declared opt-in tool (never silently mounts it)", () => {
    const r = buildInstallSpec(gh, ["rm_rf_the_repo"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not an opt-in tool");
  });

  it("an http entry builds a url spec (no command)", () => {
    const http: McpCatalogEntry = { name: "x", description: "d", url: "https://mcp.example.com", defaultTools: ["read"] };
    const r = buildInstallSpec(http);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spec.url).toBe("https://mcp.example.com");
      expect(r.spec.command).toBeUndefined();
    }
  });
});

describe("installIntoConfig", () => {
  it("merges a server in and overwrites on re-install (name wins)", () => {
    const spec1 = { command: "npx", args: ["a"], tools: ["read"] };
    const spec2 = { command: "npx", args: ["b"], tools: ["read", "write"] };
    let cfg = installIntoConfig({ servers: {} }, "s", spec1);
    expect(cfg.servers.s).toEqual(spec1);
    cfg = installIntoConfig(cfg, "s", spec2);
    expect(cfg.servers.s).toEqual(spec2); // re-install replaces
    cfg = installIntoConfig(cfg, "other", spec1);
    expect(Object.keys(cfg.servers).sort()).toEqual(["other", "s"]); // existing preserved
  });
});
