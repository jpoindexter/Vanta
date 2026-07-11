import { describe, expect, it } from "vitest";
import { buildTaskRunner, buildTaskXml } from "./windows.js";

describe("Windows Task Scheduler artifacts", () => {
  it("builds a least-privilege task with bounded restart", () => {
    const xml = buildTaskXml({ runnerPath: "C:\\Users\\me\\.vanta\\service\\runner.ps1", workingDir: "C:\\Vanta & tools" });
    expect(xml).toContain("VANTA-MANAGED: studio.theft.vanta.gateway");
    expect(xml).toContain("<RunLevel>LeastPrivilege</RunLevel>");
    expect(xml).toContain("<Count>5</Count>");
    expect(xml).toContain("runner.ps1");
    expect(xml).toContain("C:\\Vanta &amp; tools");
  });

  it("builds an owned runner with explicit log redirection", () => {
    const runner = buildTaskRunner({ command: "C:\\Vanta & tools\\run.ps1", args: ["gateway"], logPath: "C:\\Users\\me\\.vanta\\gateway.log" });
    expect(runner).toContain("VANTA-MANAGED");
    expect(runner).toContain("C:\\Vanta & tools\\run.ps1");
    expect(runner).toContain("gateway.log");
    expect(runner).toContain("*>>");
  });
});
