import { describe, it, expect } from "vitest";
import { buildAgentRegistry } from "./server.js";

describe("buildAgentRegistry", () => {
  it("returns a registry object with name and capabilities", () => {
    const reg = buildAgentRegistry("/tmp/vanta");
    expect(reg.name).toBe("vanta");
    expect(Array.isArray(reg.capabilities)).toBe(true);
    expect(reg.actions).toBeTruthy();
  });

  it("includes the repoRoot", () => {
    const reg = buildAgentRegistry("/my/project");
    expect(reg.rootPath).toBe("/my/project");
  });
});

describe("ACP server module", () => {
  it("exports startAcpServer and writeAgentJson", async () => {
    const mod = await import("./server.js");
    expect(typeof mod.startAcpServer).toBe("function");
    expect(typeof mod.writeAgentJson).toBe("function");
  });
});
