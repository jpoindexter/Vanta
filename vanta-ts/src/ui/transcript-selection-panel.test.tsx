import { describe, expect, it } from "vitest";
import { renderUi, waitForFrame } from "./test-render.js";
import { TranscriptSelectionPanel } from "./transcript-selection-panel.js";
import type { Entry } from "./types.js";

describe("TranscriptSelectionPanel", () => {
  it("renders the selected transcript range in the live panel", async () => {
    const entries: Entry[] = [
      { kind: "user", text: "ask" },
      { kind: "assistant", text: "alpha bravo charlie" },
    ];
    const text = "ask\n\nalpha bravo charlie";
    const start = text.indexOf("bravo");
    const inst = renderUi(<TranscriptSelectionPanel entries={entries} selection={{ anchor: start, cursor: start + "bravo".length }} />);
    const frame = await waitForFrame(inst, "transcript selection");
    expect(frame).toContain("bravo");
    expect(frame).toContain("Ctrl+C copies");
    inst.unmount();
  });
});
