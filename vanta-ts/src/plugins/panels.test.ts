import { describe, expect, it } from "vitest";
import { PluginPanelRegistry } from "./panels.js";

describe("PluginPanelRegistry", () => {
  it("sanitizes terminal controls from untrusted worker content", () => {
    const registry = new PluginPanelRegistry();
    const escape = String.fromCharCode(27);
    const panel = registry.register("operator", {
      id: "status",
      title: `${escape}[31mStatus${escape}[0m`,
      lines: [`safe${String.fromCharCode(7)}line`],
    });
    expect(panel.title).toBe("Status");
    expect(panel.lines).toEqual(["safe line"]);
    expect(JSON.stringify(panel)).not.toContain(escape);
  });
});
