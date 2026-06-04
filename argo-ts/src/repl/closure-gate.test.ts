import { describe, it, expect } from "vitest";
import { extractWrittenFiles, hasCommitAfterIndex, getInProgressItems, buildClosureGateText } from "./closure-gate.js";
import type { Message } from "../types.js";

const writeMsg = (path: string, idx: number): Message => ({
  role: "assistant",
  content: "",
  toolCalls: [{ id: String(idx), name: "write_file", arguments: { path, content: "x" } }],
});

const commitMsg = (): Message => ({
  role: "tool",
  toolCallId: "c1",
  name: "shell_cmd",
  content: "committed: feat/foo",
});

describe("extractWrittenFiles", () => {
  it("returns paths of write_file calls in order", () => {
    const msgs: Message[] = [
      writeMsg("src/a.ts", 0),
      writeMsg("src/b.ts", 1),
    ];
    const result = extractWrittenFiles(msgs);
    expect(result.map((r) => r.path)).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("returns empty array when no write_file calls", () => {
    const msgs: Message[] = [{ role: "user", content: "hi" }];
    expect(extractWrittenFiles(msgs)).toHaveLength(0);
  });
});

describe("hasCommitAfterIndex", () => {
  it("returns true when a commit shell_cmd result appears after the write index", () => {
    const msgs: Message[] = [
      writeMsg("src/a.ts", 0),
      commitMsg(),
    ];
    expect(hasCommitAfterIndex(msgs, 0)).toBe(true);
  });

  it("returns false when no commit appears after the write index", () => {
    const msgs: Message[] = [
      writeMsg("src/a.ts", 0),
      { role: "tool", toolCallId: "t2", name: "read_file", content: "some content" },
    ];
    expect(hasCommitAfterIndex(msgs, 0)).toBe(false);
  });

  it("does not count a commit that happened BEFORE the write", () => {
    const msgs: Message[] = [
      commitMsg(),
      writeMsg("src/a.ts", 1),
    ];
    // write is at index 1, commit at index 0 — not after
    expect(hasCommitAfterIndex(msgs, 1)).toBe(false);
  });
});

describe("getInProgressItems", () => {
  it("returns files written without a subsequent commit", () => {
    const msgs: Message[] = [writeMsg("src/a.ts", 0)];
    expect(getInProgressItems(msgs)).toContain("src/a.ts");
  });

  it("excludes files that were written then committed", () => {
    const msgs: Message[] = [writeMsg("src/a.ts", 0), commitMsg()];
    expect(getInProgressItems(msgs)).toHaveLength(0);
  });

  it("deduplicates repeated writes to the same file", () => {
    const msgs: Message[] = [writeMsg("src/a.ts", 0), writeMsg("src/a.ts", 1)];
    expect(getInProgressItems(msgs)).toHaveLength(1);
  });

  it("caps output at 5 items", () => {
    const msgs: Message[] = Array.from({ length: 8 }, (_, i) => writeMsg(`src/f${i}.ts`, i));
    expect(getInProgressItems(msgs).length).toBeLessThanOrEqual(5);
  });
});

describe("buildClosureGateText", () => {
  it("lists the in-progress items and suggests action", () => {
    const text = buildClosureGateText(["src/a.ts", "src/b.ts"]);
    expect(text).toContain("src/a.ts");
    expect(text).toContain("src/b.ts");
    expect(text).toMatch(/boundary|close|defer/i);
  });
});
