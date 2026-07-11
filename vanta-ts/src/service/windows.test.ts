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
    const encoded = xml.match(/-EncodedCommand ([A-Za-z0-9+/=]+)/)?.[1];
    expect(encoded).toBeDefined();
    const command = Buffer.from(encoded!, "base64").toString("utf16le");
    expect(command).toContain("C:\\Vanta & tools\\run.ps1");
    expect(command).toContain("gateway");
    expect(command).toContain("gateway.log");
  });
});
