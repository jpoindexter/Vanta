import { describe, it, expect } from "vitest";
import { navigateHistory, type HistState } from "./composer.js";

const empty: HistState = { histIdx: -1, draft: "", value: "" };
const withDraft = (value: string): HistState => ({ histIdx: -1, draft: "", value });

describe("navigateHistory — up", () => {
  it("does nothing when history is empty", () => {
    const state = withDraft("hello");
    expect(navigateHistory([], state, "up")).toEqual(state);
  });

  it("saves draft and shows the most recent message", () => {
    const hist = ["first", "second"];
    const result = navigateHistory(hist, withDraft("current"), "up");
    expect(result.value).toBe("second");
    expect(result.draft).toBe("current");
    expect(result.histIdx).toBe(0);
  });

  it("navigates to the next older message on repeated up", () => {
    const hist = ["first", "second"];
    const after1 = navigateHistory(hist, withDraft("draft"), "up");
    const after2 = navigateHistory(hist, after1, "up");
    expect(after2.value).toBe("first");
    expect(after2.histIdx).toBe(1);
  });

  it("does not go past the oldest entry", () => {
    const hist = ["only"];
    const after1 = navigateHistory(hist, withDraft("x"), "up");
    const after2 = navigateHistory(hist, after1, "up");
    expect(after2.value).toBe("only");
    expect(after2.histIdx).toBe(0);
  });
});

describe("navigateHistory — down", () => {
  it("does nothing when already at draft (histIdx -1)", () => {
    expect(navigateHistory(["a"], empty, "down")).toEqual({ histIdx: -1, draft: "", value: "" });
  });

  it("navigates to a newer message", () => {
    const hist = ["first", "second"];
    const atFirst: HistState = { histIdx: 1, draft: "draft", value: "first" };
    const result = navigateHistory(hist, atFirst, "down");
    expect(result.value).toBe("second");
    expect(result.histIdx).toBe(0);
  });

  it("restores the draft when going below the oldest", () => {
    const hist = ["msg"];
    const atMsg: HistState = { histIdx: 0, draft: "my draft", value: "msg" };
    const result = navigateHistory(hist, atMsg, "down");
    expect(result.value).toBe("my draft");
    expect(result.histIdx).toBe(-1);
  });
});

describe("navigateHistory — round-trip", () => {
  it("up then down restores the original draft", () => {
    const hist = ["a", "b", "c"];
    let state = withDraft("working on this");
    state = navigateHistory(hist, state, "up"); // c
    state = navigateHistory(hist, state, "up"); // b
    state = navigateHistory(hist, state, "down"); // c
    state = navigateHistory(hist, state, "down"); // draft
    expect(state.value).toBe("working on this");
    expect(state.histIdx).toBe(-1);
  });
});
