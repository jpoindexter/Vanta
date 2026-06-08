import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { EntryRow } from "./transcript.js";
import type { Entry } from "./transcript.js";

// THINK-FOLD tests: thinking entries expand/collapse via the `expanded` prop
// (wired to Ctrl+O in the live TUI via state.expanded from app-reducer.ts).

describe("THINK-FOLD — thinking entry expand/collapse", () => {
  const thinking: Entry = { kind: "thinking", text: "FIRST\nSECOND\nTHIRD" };

  it("collapsed: shows only the first line, not subsequent lines", () => {
    const { lastFrame, unmount } = render(<EntryRow entry={thinking} expanded={false} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("FIRST");
    expect(frame).not.toContain("SECOND");
    unmount();
  });

  it("expanded: shows the full text including subsequent lines", () => {
    const { lastFrame, unmount } = render(<EntryRow entry={thinking} expanded={true} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("SECOND");
    expect(frame).toContain("THIRD");
    unmount();
  });
});
