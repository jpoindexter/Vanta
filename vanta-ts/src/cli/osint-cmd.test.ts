import { describe, expect, it } from "vitest";
import { runOsintCommand } from "./osint-cmd.js";

describe("runOsintCommand", () => {
  it("prints an OSINT plan and exits 0", () => {
    const lines: string[] = [];
    expect(runOsintCommand(["plan", "Acme", "Holdings", "--domain", "acme.example"], (line) => lines.push(line))).toBe(0);

    const text = lines.join("\n");
    expect(text).toContain("OSINT plan: Acme Holdings");
    expect(text).toContain("icann-lookup");
    expect(text).toContain("No API keys are required");
  });

  it("prints JSON for automation", () => {
    const lines: string[] = [];
    expect(runOsintCommand(["Acme", "--ticker", "ACME", "--json"], (line) => lines.push(line))).toBe(0);

    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed.identifiers).toContainEqual({ kind: "ticker", value: "ACME" });
    expect(parsed.sources.map((source: { id: string }) => source.id)).toContain("sec-edgar");
  });

  it("rejects missing subjects with usage", () => {
    const lines: string[] = [];
    expect(runOsintCommand(["plan", "--domain", "acme.example"], (line) => lines.push(line))).toBe(1);
    expect(lines.join("\n")).toContain("usage: vanta osint plan");
  });
});
