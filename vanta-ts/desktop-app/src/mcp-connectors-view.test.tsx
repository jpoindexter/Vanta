import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { McpConnectorsView } from "./mcp-connectors-view.js";
import type { DesktopMcpPayload } from "./mcp-types.js";

const payload: DesktopMcpPayload = {
  connectors: [{
    name: "notes", source: "project", transport: "stdio", enabled: true,
    trust: "trusted", auth: "not_required", authMode: "none", missingEnv: [], health: "ready",
    tools: ["search_notes"], resources: ["fixture://status"],
  }],
  catalog: [{ name: "fetch", description: "Fetch URLs", defaultTools: ["fetch"], installed: false }],
  receipts: [{ version: 1, at: "2026-07-17T00:00:00.000Z", action: "test", server: "notes", outcome: "passed", detail: "1 tool, 1 resource" }],
};

describe("McpConnectorsView", () => {
  it("shows shared registry lifecycle, inventory, catalog, and receipts", () => {
    const html = renderToStaticMarkup(<McpConnectorsView payload={payload} loading={false} pending="" error="" onRefresh={async () => undefined} onAction={async () => payload} />);
    expect(html).toContain("Import Claude Desktop");
    expect(html).toContain("search_notes");
    expect(html).toContain("fixture://status");
    expect(html).toContain("Reconnect");
    expect(html).toContain("Vetted catalog");
    expect(html).toContain("Recent receipts");
    expect(html).not.toContain("TOKEN");
  });

  it("explains trust and authorization requirements in words", () => {
    const needsSetup: DesktopMcpPayload = {
      ...payload,
      connectors: [{ ...payload.connectors[0]!, trust: "pending", auth: "needs_auth", authMode: "oauth", health: "needs_setup", tools: [], resources: [] }],
    };
    const html = renderToStaticMarkup(<McpConnectorsView payload={needsSetup} loading={false} pending="" error="" onRefresh={async () => undefined} onAction={async () => needsSetup} />);
    expect(html).toContain("Trust required");
    expect(html).toContain("Authorize");
    expect(html).toContain("Trust");
  });
});
