import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { Text } from "ink";
import { renderUi, tick } from "../test-render.js";
import { ThemedBox, ThemedText } from "./themed.js";

describe("ThemedText", () => {
  it("renders its child text", async () => {
    const inst = renderUi(h(ThemedText, {}, "hello world"));
    await tick();
    expect(inst.lastFrame()).toContain("hello world");
    inst.unmount();
  });

  it("renders bold/muted content without crashing", async () => {
    const inst = renderUi(h(ThemedText, { bold: true, muted: true }, "styled"));
    await tick();
    expect(inst.lastFrame()).toContain("styled");
    inst.unmount();
  });
});

describe("ThemedBox", () => {
  it("renders its children", async () => {
    const inst = renderUi(h(ThemedBox, {}, h(Text, {}, "boxed child")));
    await tick();
    expect(inst.lastFrame()).toContain("boxed child");
    inst.unmount();
  });

  it("draws a border when bordered", async () => {
    const inst = renderUi(h(ThemedBox, { bordered: true }, h(Text, {}, "inside")));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("inside");
    // round border corners
    expect(frame).toMatch(/[╭╮╰╯]/);
    inst.unmount();
  });
});
