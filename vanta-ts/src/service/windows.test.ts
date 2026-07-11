import { describe, expect, it } from "vitest";
import { buildTaskXml } from "./windows.js";

describe("buildTaskXml", () => {
  it("builds a least-privilege task with bounded restart and log redirection", () => {
    const xml = buildTaskXml({
      command: "C:\\Vanta & tools\\run.ps1",
      args: ["gateway"],
      workingDir: "C:\\Vanta & tools",
      logPath: "C:\\Users\\me\\.vanta\\gateway.log",
    });
    expect(xml).toContain("VANTA-MANAGED: studio.theft.vanta.gateway");
    expect(xml).toContain("<RunLevel>LeastPrivilege</RunLevel>");
    expect(xml).toContain("<Count>5</Count>");
    expect(xml).toContain("C:\\Vanta &amp; tools\\run.ps1");
    expect(xml).toContain("gateway");
    expect(xml).toContain("gateway.log");
  });
});
