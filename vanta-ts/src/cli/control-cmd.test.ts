import { describe, it, expect } from "vitest";
import { toolPresent, desktopControlDoctor, formatDoctor, runControlCommand, type CmdRunner } from "./control-cmd.js";

const have = (...tools: string[]): CmdRunner => (cmd, args) => {
  if (cmd === "which" && tools.includes(args[0] ?? "")) return `/usr/bin/${args[0]}`;
  throw new Error("not found");
};

describe("toolPresent", () => {
  it("true when which resolves, false otherwise", () => {
    expect(toolPresent(have("cliclick"), "cliclick")).toBe(true);
    expect(toolPresent(have("cliclick"), "ffmpeg")).toBe(false);
  });
});

describe("desktopControlDoctor", () => {
  it("ready on macOS with both deps present", () => {
    const d = desktopControlDoctor(have("screencapture", "cliclick"), "darwin");
    expect(d.ready).toBe(true);
    expect(d.screencapture).toBe(true);
    expect(d.cliclick).toBe(true);
  });
  it("not ready when cliclick is missing → actionable note", () => {
    const d = desktopControlDoctor(have("screencapture"), "darwin");
    expect(d.ready).toBe(false);
    expect(d.notes.join(" ")).toMatch(/brew install cliclick/);
  });
  it("non-macOS → not ready, flagged", () => {
    const d = desktopControlDoctor(have("cliclick"), "linux");
    expect(d.ready).toBe(false);
    expect(d.notes.join(" ")).toMatch(/macOS-only/);
  });
});

describe("runControlCommand", () => {
  it("setup → opens both panes + reports", async () => {
    const opened: string[] = [];
    const lines: string[] = [];
    const code = await runControlCommand("/r", [], {
      log: (l) => lines.push(l),
      run: have("screencapture", "cliclick"),
      openPane: (p) => {
        opened.push(p);
        return { ok: true, url: "u", message: `opened ${p}` };
      },
    });
    expect(code).toBe(0);
    expect(opened).toEqual(["screen-recording", "accessibility"]);
    expect(lines.join("\n")).toMatch(/READY/);
  });

  it("doctor → exit 1 when not ready", async () => {
    const code = await runControlCommand("/r", ["doctor"], { log: () => {}, run: have("screencapture") /* no cliclick */ });
    expect(code).toBe(1);
  });
});
