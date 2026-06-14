import { describe, it, expect } from "vitest";
import { readlineEdit, navigateHistory, type Key, type HistState } from "./composer-keys.js";

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
  it("^Y yanks the kill ring at the cursor", () => {
    expect(readlineEdit(s("world", 0, "hello "), "y", k({ ctrl: true }))).toMatchObject({ value: "hello world" });
  });
  it("ignores Enter and bare arrows (handled elsewhere)", () => {
    expect(readlineEdit(s("x", 1), "", k({ return: true }))).toBeNull();
    expect(readlineEdit(s("x", 1), "", k({ upArrow: true }))).toBeNull();
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
