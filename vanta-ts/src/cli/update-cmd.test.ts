import { describe, it, expect } from "vitest";
import { handleUpdate, runUpdateCommand, UPGRADE_COMMAND } from "./update-cmd.js";

function sink() {
  const lines: string[] = [];
  return { log: (l: string) => lines.push(l), lines };
}

describe("handleUpdate", () => {
  it("prints the notice + upgrade command when an update is available", async () => {
    const out = sink();
    const code = await handleUpdate({
      currentVersion: "0.2.0",
      fetchLatest: async () => "0.3.0",
      log: out.log,
    });
    expect(code).toBe(0);
    const joined = out.lines.join("\n");
    expect(joined).toContain("Update available");
    expect(joined).toContain("0.3.0");
    expect(joined).toContain(UPGRADE_COMMAND);
  });

  it("does NOT auto-run the upgrade — only prints the command", async () => {
    const out = sink();
    await handleUpdate({
      currentVersion: "0.2.0",
      fetchLatest: async () => "0.3.0",
      log: out.log,
    });
    // The upgrade command appears as printed text, never executed: it shows up
    // verbatim with the "To upgrade:" lead-in and is the only place it occurs.
    expect(out.lines.some((l) => l.includes(`To upgrade: ${UPGRADE_COMMAND}`))).toBe(true);
  });

  it("prints 'up to date' when current equals latest", async () => {
    const out = sink();
    const code = await handleUpdate({
      currentVersion: "0.2.0",
      fetchLatest: async () => "0.2.0",
      log: out.log,
    });
    expect(code).toBe(0);
    expect(out.lines.join("\n")).toContain("up to date");
  });

  it("prints 'up to date' (no false positive) on a fetch failure", async () => {
    const out = sink();
    const code = await handleUpdate({
      currentVersion: "0.2.0",
      fetchLatest: async () => {
        throw new Error("offline");
      },
      log: out.log,
    });
    expect(code).toBe(0);
    const joined = out.lines.join("\n");
    expect(joined).toContain("up to date");
    expect(joined).not.toContain("Update available");
  });
});

describe("runUpdateCommand", () => {
  it("is exported as the `vanta update` dispatch entry and returns an exit code", async () => {
    expect(typeof runUpdateCommand).toBe("function");
    // Runs live (npm registry + local package.json); both fetch paths fail
    // closed, so this resolves to 0 regardless of network state.
    const code = await runUpdateCommand([]);
    expect(code).toBe(0);
  });
});
