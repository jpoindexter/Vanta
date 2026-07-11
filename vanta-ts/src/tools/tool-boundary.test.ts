import { describe, expect, it } from "vitest";
import { buildRegistry } from "./index.js";
import { explainToolBoundary, repairToolFailure } from "./tool-boundary.js";

describe("profile tool boundaries", () => {
  it("builds a registry containing only explicitly included tools", () => {
    const registry = buildRegistry({ include: ["read_file", "tool_search"] });
    registry.register({ schema: { name: "mcp_late_tool", description: "late", parameters: { type: "object", properties: {} } }, execute: async () => ({ ok: true, output: "x" }) });
    const names = registry.schemas().map((schema) => schema.name);
    expect(names.sort()).toEqual(["read_file", "tool_search"]);
  });

  it("explains role visibility, risk, setup, credentials, and exact repair", () => {
    const schemas = buildRegistry().schemas();
    const explanation = explainToolBoundary("gmail_send", {
      schemas,
      settings: { allowedTools: ["read_file"] },
      profileId: "research-lead",
      env: {},
      fileExists: () => false,
    });

    expect(explanation).toMatchObject({ visible: false, typicalRisk: "ask" });
    expect(explanation.missing).toContain("Google OAuth token");
    expect(explanation.repairs).toContain("vanta profiles tools research-lead --allow gmail_send");
    expect(explanation.repairs).toContain("vanta auth google");
  });

  it("warns when a profile has no role allowlist", () => {
    const explanation = explainToolBoundary("read_file", {
      schemas: buildRegistry().schemas(), settings: {}, profileId: "general", env: {}, fileExists: () => false,
    });
    expect(explanation.visible).toBe(true);
    expect(explanation.warning).toContain("full tool surface");
    expect(explanation.typicalRisk).toBe("allow");
  });

  it("turns opaque credential failures into an actionable repair path", () => {
    const repaired = repairToolFailure("gmail_send", "401 unauthorized", {
      schemas: buildRegistry().schemas(), settings: {}, env: {}, fileExists: () => false,
    });
    expect(repaired).toContain("401 unauthorized");
    expect(repaired).toContain("Repair: vanta auth google");
  });
});
