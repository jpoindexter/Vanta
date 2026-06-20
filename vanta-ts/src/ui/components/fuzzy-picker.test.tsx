import { createElement, type ReactElement } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderUi, tick, waitForFrame, waitUntil } from "../test-render.js";
import { FuzzyPicker } from "./fuzzy-picker.js";

const ITEMS = ["read_file", "write_file", "shell_cmd", "web_search"];
const toLabel = (s: string): string => s;

/** Build a string-typed FuzzyPicker element; `createElement` can't infer the
 *  component's generic from the props object, so we fix `T = string` here. */
type PickerProps = Parameters<typeof FuzzyPicker<string>>[0];
const picker = (props: PickerProps): ReactElement =>
  createElement(FuzzyPicker<string>, props);

describe("FuzzyPicker", () => {
  it("renders the title, all items, and the footer hint", async () => {
    const inst = renderUi(picker({ items: ITEMS, toLabel, onSelect: vi.fn(), title: "Tool" }));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("Tool");
    expect(frame).toContain("read_file");
    expect(frame).toContain("write_file");
    expect(frame).toContain("Esc close");
    inst.unmount();
  });

  it("activates the top result on Enter (no query → first item)", async () => {
    const onSelect = vi.fn();
    const inst = renderUi(picker({ items: ITEMS, toLabel, onSelect }));
    await tick();
    inst.input("\r"); // Enter
    await waitUntil(() => onSelect.mock.calls.length > 0);
    expect(onSelect).toHaveBeenCalledWith("read_file");
    inst.unmount();
  });

  it("filters to the matching item: typing then Enter selects the filtered match", async () => {
    // Type "web" → only web_search matches → it becomes the (only) top result, so
    // Enter activates it. This proves the query narrowed the candidate set away
    // from the default first item.
    const onSelect = vi.fn();
    const inst = renderUi(picker({ items: ITEMS, toLabel, onSelect }));
    await tick();
    inst.input("web");
    await waitForFrame(inst, "web"); // query echo confirms input was consumed
    inst.input("\r");
    await waitUntil(() => onSelect.mock.calls.length > 0);
    expect(onSelect).toHaveBeenCalledWith("web_search");
    inst.unmount();
  });

  it("shows 'no matches' when the query matches nothing", async () => {
    const inst = renderUi(picker({ items: ITEMS, toLabel, onSelect: vi.fn() }));
    await tick();
    inst.input("zzzz"); // no item contains this subsequence
    const frame = await waitForFrame(inst, "no matches");
    expect(frame).toContain("no matches");
    inst.unmount();
  });

  it("moves the selection down with the down arrow", async () => {
    // With no query, ↓ moves from read_file (idx 0) to write_file (idx 1); Enter
    // then activates write_file, proving the selection moved.
    const onSelect = vi.fn();
    const inst = renderUi(picker({ items: ITEMS, toLabel, onSelect }));
    await tick();
    inst.input("\x1b[B"); // down arrow
    await tick();
    inst.input("\r");
    await waitUntil(() => onSelect.mock.calls.length > 0);
    expect(onSelect).toHaveBeenCalledWith("write_file");
    inst.unmount();
  });

  it("closes on Esc", async () => {
    const onClose = vi.fn();
    const inst = renderUi(picker({ items: ITEMS, toLabel, onSelect: vi.fn(), onClose }));
    await tick();
    inst.input("\x1b"); // Esc (Ink debounces escape)
    await waitUntil(() => onClose.mock.calls.length > 0);
    expect(onClose).toHaveBeenCalled();
    inst.unmount();
  });
});
