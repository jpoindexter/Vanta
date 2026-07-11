import { describe, expect, it } from "vitest";
import { buildRegistry } from "../tools/index.js";
import { runToolsCommand } from "./tools-cmd.js";

describe("vanta tools why", () => {
  it("prints the active role boundary and repair steps", async () => {
    const lines: string[] = [];
    const code = await runToolsCommand("/repo", ["why", "gmail_send"], {
      env: { VANTA_PROFILE: "research-lead" },
      log: (line) => lines.push(line),
      loadSettings: async () => ({ allowedTools: ["read_file"] }),
      schemas: () => buildRegistry().schemas(),
      fileExists: () => false,
    });

    const output = lines.join("\n");
    expect(code).toBe(0);
    expect(output).toContain("hidden for research-lead");
    expect(output).toContain("typical kernel risk: ask");
    expect(output).toContain("vanta auth google");
  });
});
