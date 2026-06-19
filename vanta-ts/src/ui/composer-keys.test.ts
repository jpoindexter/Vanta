import { describe, it, expect } from "vitest";
import { readlineEdit, navigateHistory, historyTypeahead, type Key, type HistState } from "./composer-keys.js";

const s = (value: string, cursor: number, killRing = "") => ({ value, cursor, killRing });
const k = (over: Partial<Key>): Key => ({ ...over });

describe("readlineEdit chords", () => {
  it("inserts a printable char at the cursor", () => {
    expect(readlineEdit(s("ac", 1), "b", k({}))).toEqual({ value: "abc", cursor: 2 });
  });
  it("backspaces before the cursor", () => {
    expect(readlineEdit(s("abc", 2), "", k({ backspace: true }))).toEqual({ value: "ac", cursor: 1 });
  });
  it("^A/^E jump to start/end", () => {
    expect(readlineEdit(s("hello", 3), "a", k({ ctrl: true }))).toEqual({ value: "hello", cursor: 0 });
    expect(readlineEdit(s("hello", 1), "e", k({ ctrl: true }))).toEqual({ value: "hello", cursor: 5 });
  });
  it("^U kills to start and reports the killed text", () => {
    expect(readlineEdit(s("hello world", 6), "u", k({ ctrl: true }))).toEqual({ value: "world", cursor: 0, kill: "hello " });
  });
  it("Cmd+Backspace (super) clears to line start, same as ^U", () => {
    expect(readlineEdit(s("hello world", 6), "", k({ super: true, backspace: true }))).toEqual({ value: "world", cursor: 0, kill: "hello " });
  });
  it("does not type a Cmd-modified letter (super is not printable)", () => {
    expect(readlineEdit(s("ab", 2), "a", k({ super: true }))).toBeNull();
  });
  it("^Y yanks the kill ring at the cursor", () => {
    expect(readlineEdit(s("world", 0, "hello "), "y", k({ ctrl: true }))).toMatchObject({ value: "hello world" });
  });
  it("ignores Enter and bare arrows (handled elsewhere)", () => {
    expect(readlineEdit(s("x", 1), "", k({ return: true }))).toBeNull();
    expect(readlineEdit(s("x", 1), "", k({ upArrow: true }))).toBeNull();
  });
});

describe("historyTypeahead", () => {
  it("returns the suffix of the most recent match", () => {
    expect(historyTypeahead(["git commit -m", "git commit -am"], "git commit")).toBe(" -am");
  });
  it("returns empty string when prefix has no match", () => {
    expect(historyTypeahead(["npm install", "npm test"], "git")).toBe("");
  });
  it("returns empty string when prefix is empty", () => {
    expect(historyTypeahead(["npm install"], "")).toBe("");
  });
  it("skips entries that equal the prefix exactly", () => {
    expect(historyTypeahead(["git status", "git status"], "git status")).toBe("");
  });
  it("does not match multiline prefix", () => {
    expect(historyTypeahead(["git\nstatus"], "git\n")).toBe("");
  });
  it("returns empty when history is empty", () => {
    expect(historyTypeahead([], "git")).toBe("");
  });
});

describe("navigateHistory", () => {
  const hist = ["one", "two", "three"];
  it("walks up from the draft to the newest entry first", () => {
    const up: HistState = navigateHistory(hist, { histIdx: -1, draft: "", value: "live" }, "up");
    expect(up).toEqual({ histIdx: 0, draft: "live", value: "three" });
  });
  it("walks back down to restore the draft", () => {
    const at = { histIdx: 0, draft: "live", value: "three" };
    expect(navigateHistory(hist, at, "down")).toEqual({ histIdx: -1, draft: "", value: "live" });
  });
});
