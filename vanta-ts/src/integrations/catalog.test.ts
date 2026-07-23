import { describe, expect, it } from "vitest";
import { readIntegrationCatalog } from "./catalog.js";

const root = "/tmp/vanta-integration-catalog";
const emptyRecords = async () => [];
const emptyReceipts = async () => [];

describe("integration catalog", () => {
  it("reports every requested integration without calling an unconfigured service ready", async () => {
    const rows = await readIntegrationCatalog(root, {}, { googleAuthorized: async () => false, mcpRecords: emptyRecords, receipts: emptyReceipts });
    expect(rows.map((row) => row.id)).toEqual(["trello", "dropbox", "box", "google-drive", "atlassian-rovo", "slack", "telegram"]);
    expect(rows.find((row) => row.id === "trello")).toMatchObject({ state: "needs_setup" });
    expect(rows.find((row) => row.id === "box")).toMatchObject({ state: "installable", actions: ["install"] });
    expect(rows.find((row) => row.id === "google-drive")).toMatchObject({ state: "needs_setup", actions: ["configure"] });
  });

  it("uses live evidence for native credentials and installed connector packs", async () => {
    const rows = await readIntegrationCatalog(root, { VANTA_TRELLO_KEY: "key", VANTA_TRELLO_TOKEN: "token", VANTA_DROPBOX_TOKEN: "token" }, {
      googleAuthorized: async () => true,
      mcpRecords: async () => [{ name: "box-remote-mcp", source: "user", transport: "http", enabled: true, trust: "trusted", auth: "ready", authMode: "none", missingEnv: [], health: "ready", tools: [], resources: [] }],
      receipts: emptyReceipts,
    });
    expect(rows.find((row) => row.id === "trello")?.state).toBe("installed");
    expect(rows.find((row) => row.id === "dropbox")?.state).toBe("installed");
    expect(rows.find((row) => row.id === "google-drive")?.state).toBe("installed");
    expect(rows.find((row) => row.id === "box")?.state).toBe("ready");
    expect(rows.find((row) => row.id === "google-drive")?.actions).toEqual(["test", "configure"]);
    expect(rows.find((row) => row.id === "box")?.actions).toEqual(["test", "manage_mcp"]);
  });

  it("labels a native service ready only after its bounded test passes", async () => {
    const rows = await readIntegrationCatalog(root, { VANTA_DROPBOX_TOKEN: "token" }, {
      googleAuthorized: async () => false, mcpRecords: emptyRecords,
      receipts: async () => [{ version: 1, at: "2026-07-23T00:00:00.000Z", integration: "dropbox", action: "test", outcome: "passed", detail: "bounded test" }],
    });
    expect(rows.find((row) => row.id === "dropbox")).toMatchObject({ state: "ready", actions: ["test", "configure"] });
  });
});
