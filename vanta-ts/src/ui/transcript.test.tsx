import { describe, it, expect } from "vitest";
import { EntryView } from "./transcript.js";
import { renderUi, waitForFrame } from "./test-render.js";
import type { Entry } from "./types.js";

// Wire test for VANTA-BIDI-TEXT: the transcript passes user/assistant/note prose
// through `reorderBidi` only when it contains strong-RTL text, so RTL renders in
// visual order and pure-LTR output stays byte-identical.
const SHALOM = "שלום"; // hello (Hebrew), logical order
const rev = (s: string): string => [...s].reverse().join("");

describe("transcript bidi wire", () => {
  it("renders a pure-LTR assistant line byte-identical (guard keeps LTR untouched)", async () => {
    const entry: Entry = { kind: "assistant", text: "hello world 123" };
    const inst = renderUi(<EntryView entry={entry} />);
    const frame = await waitForFrame(inst, "hello world 123");
    expect(frame).toContain("hello world 123");
    inst.unmount();
  });

  it("reorders an RTL assistant line into visual order", async () => {
    const entry: Entry = { kind: "assistant", text: SHALOM };
    const inst = renderUi(<EntryView entry={entry} />);
    // Visual order is the reversed Hebrew run; the raw logical order must NOT appear.
    const frame = await waitForFrame(inst, rev(SHALOM));
    expect(frame).toContain(rev(SHALOM));
    inst.unmount();
  });

  it("reorders an RTL user line into visual order", async () => {
    const entry: Entry = { kind: "user", text: SHALOM };
    const inst = renderUi(<EntryView entry={entry} />);
    const frame = await waitForFrame(inst, rev(SHALOM));
    expect(frame).toContain(rev(SHALOM));
    inst.unmount();
  });

  it("keeps an LTR user line byte-identical", async () => {
    const entry: Entry = { kind: "user", text: "no rtl here" };
    const inst = renderUi(<EntryView entry={entry} />);
    const frame = await waitForFrame(inst, "no rtl here");
    expect(frame).toContain("no rtl here");
    inst.unmount();
  });

  it("reorders RTL note text into visual order", async () => {
    const entry: Entry = { kind: "note", text: SHALOM };
    const inst = renderUi(<EntryView entry={entry} />);
    const frame = await waitForFrame(inst, rev(SHALOM));
    expect(frame).toContain(rev(SHALOM));
    inst.unmount();
  });
});
