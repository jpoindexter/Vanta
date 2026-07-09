import { describe, expect, it } from "vitest";
import {
  handleTranscriptSelectionKey,
  renderSelectionPreview,
  selectedTranscriptText,
  transcriptPlainText,
  type TranscriptSelection,
} from "./transcript-selection.js";
import type { Entry } from "./types.js";

const entries: Entry[] = [
  { kind: "user", text: "fix this" },
  { kind: "assistant", text: "alpha\nbravo\ncharlie" },
];

describe("transcript selection model", () => {
  it("flattens transcript entries into copyable text", () => {
    expect(transcriptPlainText(entries)).toBe("fix this\n\nalpha\nbravo\ncharlie");
  });

  it("shift+left starts from transcript end and extends a character selection", () => {
    const result = handleTranscriptSelectionKey(entries, null, "", { shift: true, leftArrow: true });
    expect(result.kind).toBe("move");
    const selection = result.kind === "move" ? result.selection : null;
    expect(selectedTranscriptText(entries, selection)).toBe("e");
  });

  it("shift+up extends by visual line while preserving column", () => {
    const text = transcriptPlainText(entries);
    const atEnd: TranscriptSelection = { anchor: text.length, cursor: text.length };
    const result = handleTranscriptSelectionKey(entries, atEnd, "", { shift: true, upArrow: true });
    expect(result.kind).toBe("move");
    const selection = result.kind === "move" ? result.selection : null;
    expect(selectedTranscriptText(entries, selection)).toBe("\ncharlie");
  });

  it("ctrl+c returns the selected text instead of a normal global interrupt", () => {
    const selection = { anchor: 0, cursor: 8 };
    const result = handleTranscriptSelectionKey(entries, selection, "c", { ctrl: true });
    expect(result).toEqual({ kind: "copy", text: "fix this", selection: null });
  });

  it("ordinary typing clears selection without swallowing the keystroke", () => {
    const result = handleTranscriptSelectionKey(entries, { anchor: 0, cursor: 3 }, "x", {});
    expect(result).toEqual({ kind: "clear" });
  });

  it("marks selected preview segments", () => {
    expect(renderSelectionPreview("abcdef", { anchor: 2, cursor: 5 })).toEqual([
      { text: "ab", selected: false },
      { text: "cde", selected: true },
      { text: "f", selected: false },
    ]);
  });
});
