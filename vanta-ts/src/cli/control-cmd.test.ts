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
  it("helper presence never claims permissions, vision, or computer actions are verified", () => {
    const output = formatDoctor(desktopControlDoctor(have("screencapture", "cliclick"), "darwin"));
    expect(output).toContain("Dependencies found");
    expect(output).toContain("not verified");
    expect(output).toContain("Screen Recording");
    expect(output).toContain("Accessibility");
    expect(output).toContain("vision model");
    expect(output).not.toMatch(/READY|can see your screen and click\/type/);
  });
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
      platform: "darwin",
      openPane: (p) => {
        opened.push(p);
        return { ok: true, url: "u", message: `opened ${p}` };
      },
    });
    expect(code).toBe(0);
    expect(opened).toEqual(["screen-recording", "accessibility"]);
    expect(lines.join("\n")).toContain("Dependencies found");
  });

  it("doctor → exit 1 when not ready", async () => {
    const code = await runControlCommand("/r", ["doctor"], {
      log: () => {},
      run: have("screencapture"), /* no cliclick */
      platform: "darwin",
    });
    expect(code).toBe(1);
  });

  it("doctor inventories helpers without capturing, clicking, opening settings or claiming action success", async () => {
    const calls: string[] = [];
    const lines: string[] = [];
    const code = await runControlCommand("/r", ["doctor"], {
      log: (line) => lines.push(line),
      run: (cmd, args) => { calls.push(`${cmd} ${args.join(" ")}`); return have("screencapture", "cliclick")(cmd, args); },
      platform: "darwin",
      openPane: () => { throw new Error("Doctor must not open settings"); },
    });
    expect(code).toBe(0);
    expect(calls).toEqual(["which screencapture", "which cliclick"]);
    expect(lines.join("\n")).toContain("computer control is not verified");
  });
});
