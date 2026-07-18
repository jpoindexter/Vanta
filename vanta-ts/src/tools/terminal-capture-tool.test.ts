import { describe, it, expect } from "vitest";
import { captureViaTmux, terminalCaptureTool } from "./terminal-capture-tool.js";
import { tmuxAvailable, type TmuxRunner } from "../fleet/tmux-backend.js";

const ESC = String.fromCharCode(27); // \x1b — written this way so the byte is clean

describe("captureViaTmux (injected tmux)", () => {
  it("drops the command-echo line + control sequences, returns a clean snapshot", async () => {
    let marker = "";
    const run: TmuxRunner = (argv) => {
      if (argv[0] === "-V") return "tmux 3.5";
      if (argv[0] === "list-panes") return "%0";
      if (argv[0] === "send-keys") marker = String(argv[3]).match(/VANTA_CAPTURE_DONE_[a-f0-9]+/)?.[0] ?? "";
      if (argv[0] === "capture-pane") return `$ run; printf marker ${marker}\n${ESC}[31mHELLO${ESC}[0m world\n${marker}`;
      return ""; // send-keys / new-session / kill-session
    };
    const res = await captureViaTmux("run", { run, session: "t" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.snapshot).toContain("HELLO world"); // ANSI stripped, words intact
    expect(res.snapshot).not.toContain("t_wait"); // command-echo line dropped
    expect(res.snapshot).not.toContain(ESC); // no ESC byte survives
    expect(res.snapshot).not.toContain("[31m"); // no residual SGR
  });

  it("tmux absent → {ok:false}, never throws", async () => {
    const absent: TmuxRunner = () => {
      throw new Error("tmux: command not found");
    };
    const res = await captureViaTmux("x", { run: absent });
    expect(res.ok).toBe(false);
  });
});

describe("terminalCaptureTool", () => {
  it("surfaces the command to the kernel via describeForSafety", () => {
    expect(terminalCaptureTool.describeForSafety?.({ command: "git status" })).toBe("capture terminal: git status");
  });
  it("rejects an empty command", async () => {
    const r = await terminalCaptureTool.execute({ command: "" }, {} as never);
    expect(r.ok).toBe(false);
  });
});

// LIVE: capture REAL ANSI terminal output through real tmux. Skips where tmux is
// absent; where present it PROVES the capture path works end-to-end — not a stub.
const HAS_TMUX = tmuxAvailable();

describe.skipIf(!HAS_TMUX)("captureViaTmux (LIVE tmux)", () => {
  it("captures a command's colored terminal output and returns it stripped clean", async () => {
    // printf's \033 octal expands to a real ESC in the live pane (safe to send-keys
    // as literal backslash-chars, unlike a raw ESC byte which is a key).
    const res = await captureViaTmux(`printf '\\033[31mRED-MARKER\\033[0m and plain'`, {
      session: `vanta_cap_test_${process.pid}`,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.snapshot).toContain("RED-MARKER"); // the colored text, captured
    expect(res.snapshot).toContain("and plain");
    expect(res.snapshot).not.toContain(ESC); // control sequences stripped from the snapshot
    expect(res.snapshot).not.toContain("[31m"); // no residual SGR
  });
});
