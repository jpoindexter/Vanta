import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { VirtualTranscript } from "./virtual-transcript.js";
import type { Entry } from "./transcript.js";

const notes = (n: number): Entry[] => Array.from({ length: n }, (_, i) => ({ kind: "note", text: `note-${i}` }));

describe("VirtualTranscript scroll clamping", () => {
  it("shows the newest entries at offset 0", () => {
    const { lastFrame } = render(<VirtualTranscript entries={notes(5)} expanded={false} viewOffset={0} maxVisible={3} />);
    expect(lastFrame()).toContain("note-4");
    expect(lastFrame()).toContain("earlier"); // ↑ indicator for the 2 hidden above
    expect(lastFrame()).not.toContain("note-0");
  });

  it("can scroll until the oldest entry is reachable even when maxVisible exceeds the entry count", () => {
    // 5 entries, viewport budget 23 "entries": the old total-maxVisible clamp
    // pinned the offset to 0 (unscrollable) even though tall entries overflowed
    // the screen. total-1 lets the window slide all the way to the oldest.
    const { lastFrame } = render(<VirtualTranscript entries={notes(5)} expanded={false} viewOffset={4} maxVisible={23} />);
    expect(lastFrame()).toContain("note-0");
    expect(lastFrame()).not.toContain("note-4");
    expect(lastFrame()).toContain("newer"); // ↓ indicator for the 4 hidden below
  });

  it("clamps an over-large offset instead of blanking the viewport", () => {
    const { lastFrame } = render(<VirtualTranscript entries={notes(5)} expanded={false} viewOffset={999} maxVisible={3} />);
    expect(lastFrame()).toContain("note-0");
  });
});
