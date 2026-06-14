import { describe, it, expect } from "vitest";
import { summarizeElements, formatElements, type RawElement } from "./observe.js";

// No browser required — summarizeElements + formatElements are pure functions.

const LINKS: RawElement[] = [
  { tag: "a", text: "Home", role: "link" },
  { tag: "a", text: "About", role: "link" },
  { tag: "a", text: "Home", role: "link" }, // duplicate
];

const INPUTS: RawElement[] = [
  { tag: "input", type: "text", name: "username" },
  { tag: "input", type: "password", name: "password" },
  { tag: "button", text: "Sign in" },
];

const EMPTY_LABEL: RawElement[] = [
  { tag: "input", type: "text" }, // no name/text — dropped
  { tag: "a" }, // just a tag — no label
];

const NON_INTERACTABLE: RawElement[] = [
  { tag: "p", text: "Some paragraph" },
  { tag: "div", text: "A div" },
  { tag: "span" },
];

describe("summarizeElements", () => {
  it("returns an empty list when input is empty", () => {
    expect(summarizeElements([])).toEqual([]);
  });

  it("drops non-interactable elements", () => {
    expect(summarizeElements(NON_INTERACTABLE)).toEqual([]);
  });

  it("drops elements with empty/missing labels", () => {
    // input[type=text] with no name has type as label — still dropped because
    // label equals fallback tag. button has visible text so it passes.
    const mixed: RawElement[] = [...EMPTY_LABEL, { tag: "button", text: "Go" }];
    const result = summarizeElements(mixed);
    expect(result.every((e) => e.label !== "input" && e.label !== "a")).toBe(true);
  });

  it("deduplicates elements with the same kind+selector", () => {
    const result = summarizeElements(LINKS);
    // "Home" and "About" produce two selectors; the second "Home" is dropped
    expect(result.length).toBe(2);
    const labels = result.map((e) => e.label);
    expect(labels).toContain("Home");
    expect(labels).toContain("About");
  });

  it("assigns sequential 1-based indexes", () => {
    const result = summarizeElements([...LINKS.slice(0, 2), ...INPUTS]);
    result.forEach((el, i) => expect(el.index).toBe(i + 1));
  });

  it("caps results at 50 elements", () => {
    const many: RawElement[] = Array.from({ length: 80 }, (_, i) => ({
      tag: "button",
      text: `Button ${i}`,
    }));
    const result = summarizeElements(many);
    expect(result.length).toBe(50);
  });

  it("prefers text= selector for links", () => {
    const result = summarizeElements([{ tag: "a", text: "Read more", role: "link" }]);
    expect(result[0]?.selector).toBe("text=Read more");
    expect(result[0]?.kind).toBe("link");
  });

  it("prefers text= selector for buttons", () => {
    const result = summarizeElements([{ tag: "button", text: "Submit" }]);
    expect(result[0]?.selector).toBe("text=Submit");
    expect(result[0]?.kind).toBe("button");
  });

  it("uses [name=...] selector for named inputs", () => {
    const result = summarizeElements([{ tag: "input", type: "text", name: "email" }]);
    expect(result[0]?.selector).toBe('[name="email"]');
    expect(result[0]?.kind).toBe("input");
  });

  it("falls back to type selector for unnamed inputs", () => {
    const result = summarizeElements([{ tag: "input", type: "checkbox", text: "Remember me" }]);
    // text= won't fire for inputs; name is absent so falls to type
    expect(result[0]?.selector).toBe('input[type="checkbox"]');
  });
});

describe("formatElements", () => {
  it("returns a fallback message for an empty list", () => {
    expect(formatElements([])).toBe("(no interactable elements found)");
  });

  it("numbers items sequentially starting at 1", () => {
    const els = summarizeElements(INPUTS);
    const formatted = formatElements(els);
    expect(formatted).toContain("  1.");
    if (els.length > 1) expect(formatted).toContain("  2.");
  });

  it("includes kind, label, and selector in each line", () => {
    const els = summarizeElements([{ tag: "a", text: "Home", role: "link" }]);
    const formatted = formatElements(els);
    expect(formatted).toContain("[link]");
    expect(formatted).toContain("Home");
    expect(formatted).toContain("text=Home");
  });
});
