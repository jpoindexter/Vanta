import { describe, it, expect } from "vitest";
import { enableBracketedPaste } from "./bracketed-paste.js";

describe("enableBracketedPaste", () => {
  it("writes ESC[?2004h on a TTY and ESC[?2004l on cleanup", () => {
    const writes: string[] = [];
    const out = { isTTY: true, write: (s: string) => { writes.push(s); } };
    const disable = enableBracketedPaste(out);
    expect(writes).toEqual(["[?2004h"]);
    disable();
    expect(writes).toEqual(["[?2004h", "[?2004l"]);
  });

  it("disable is idempotent (only restores once)", () => {
    const writes: string[] = [];
    const out = { isTTY: true, write: (s: string) => { writes.push(s); } };
    const disable = enableBracketedPaste(out);
    disable();
    disable();
    expect(writes.filter((w) => w.includes("2004l"))).toHaveLength(1);
  });

  it("no-ops on a non-TTY (piped/headless)", () => {
    const writes: string[] = [];
    enableBracketedPaste({ isTTY: false, write: (s: string) => { writes.push(s); } })();
    expect(writes).toHaveLength(0);
  });
});
