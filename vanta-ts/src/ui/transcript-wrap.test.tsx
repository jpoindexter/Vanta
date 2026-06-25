import { describe, it, expect } from "vitest";
import { renderUi } from "./test-render.js";
import { EntryView } from "./transcript.js";
import type { Entry } from "./types.js";

// Regression: an assistant message rendered next to the `⏺ ` marker must wrap to
// (terminalWidth − marker), not the full width — else marker + full-width text
// overflows and the terminal re-wraps the spillover (mangled "als↵o"). cols:78.

const LONG =
  "Attention is one of the most valuable things we have, but it is easy to spend it on the wrong things and quietly lose the thread of what matters most to you. " +
  "A clear environment, a visible next step, and fewer competing options can do far more than willpower alone when it comes to staying focused on the real goal.";

function maxLineWidth(frame: string): number {
  return frame.split("\n").reduce((m, l) => Math.max(m, l.length), 0);
}

describe("EntryView wrapping", () => {
  it("wraps a long assistant message within the terminal width (no overflow)", () => {
    const inst = renderUi(<EntryView entry={{ kind: "assistant", text: LONG } as Entry} />, { cols: 78 });
    const frame = inst.lastFrame();
    const over = frame.split("\n").filter((l) => l.length > 78);
    expect(over).toEqual([]); // nothing exceeds the 78-col terminal
    expect(maxLineWidth(frame)).toBeGreaterThan(40); // sanity: it actually rendered wrapped content
    inst.unmount();
  });

  it("wraps a long user message within the terminal width", () => {
    const inst = renderUi(<EntryView entry={{ kind: "user", text: LONG } as Entry} />, { cols: 60 });
    const over = inst.lastFrame().split("\n").filter((l) => l.length > 60);
    expect(over).toEqual([]);
    inst.unmount();
  });
});
