import { describe, expect, it } from "vitest";
import { formatIntegrationCatalog } from "./integrations-cmd.js";

describe("formatIntegrationCatalog", () => {
  it("keeps truthful state and next actions visible", () => {
    expect(formatIntegrationCatalog([{ id: "trello", label: "Trello", kind: "native", state: "needs_setup", detail: "Set credentials.", actions: ["configure"] }])).toContain("Trello       Needs setup\n  Set credentials.\n  Actions: configure");
  });
});
