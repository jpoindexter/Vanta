import { describe, it, expect } from "vitest";
import { tuiCommand } from "./tui-cmd.js";

const ctx = {} as never;

describe("tuiCommand (/tui)", () => {
  it("returns status info when called with no arg", async () => {
    const r = await tuiCommand("", ctx);
    expect(r.output).toContain("fullscreen");
  });

  it("returns status info for /tui status", async () => {
    const r = await tuiCommand("status", ctx);
    expect(r.output).toContain("fullscreen");
  });

  it("confirms fullscreen for /tui fullscreen", async () => {
    const r = await tuiCommand("fullscreen", ctx);
    expect(r.output).toContain("fullscreen");
  });

  it("exits for /tui exit", async () => {
    const r = await tuiCommand("exit", ctx);
    expect(r.exit).toBe(true);
  });

  it("returns unknown subcommand message for unrecognised arg", async () => {
    const r = await tuiCommand("bogus", ctx);
    expect(r.output).toContain("Unknown subcommand");
    expect(r.output).toContain("bogus");
  });
});
