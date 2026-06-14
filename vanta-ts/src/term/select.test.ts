import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { renderMenu, select, type SelectInput, type SelectOutput } from "./select.js";

function fakeTty(isTTY = true): SelectInput {
  const em = new EventEmitter() as unknown as SelectInput & EventEmitter;
  Object.assign(em, { isTTY, setRawMode: () => {}, resume: () => {}, pause: () => {} });
  return em;
}
const sink: SelectOutput = { write: () => {} };
const press = (em: SelectInput, name: string, mods: object = {}) => (em as EventEmitter).emit("keypress", "", { name, ...mods });

describe("renderMenu", () => {
  it("marks the active row with ❯ and shows the hint", () => {
    const f = renderMenu("Pick", ["a", "b", "c"], 1, true);
    expect(f).toContain("  ❯ b");
    expect(f).toContain("    a");
    expect(f).toContain("Esc back");
  });
  it("omits Esc-back when canBack is false", () => {
    expect(renderMenu("Pick", ["a"], 0, false)).not.toContain("Esc back");
  });
});

describe("select", () => {
  it("non-TTY → resolves the initial index immediately", async () => {
    expect(await select("t", ["a", "b"], { input: fakeTty(false), initial: 1 })).toBe(1);
  });

  it("down + Enter selects the next option", async () => {
    const em = fakeTty();
    const p = select("Pick", ["a", "b", "c"], { input: em, output: sink });
    press(em, "down");
    press(em, "return");
    expect(await p).toBe(1);
  });

  it("up from the top wraps to the last option", async () => {
    const em = fakeTty();
    const p = select("Pick", ["a", "b", "c"], { input: em, output: sink });
    press(em, "up");
    press(em, "return");
    expect(await p).toBe(2);
  });

  it("Esc returns -1 (back) when canBack", async () => {
    const em = fakeTty();
    const p = select("Pick", ["a", "b"], { input: em, output: sink, canBack: true });
    press(em, "escape");
    expect(await p).toBe(-1);
  });

  it("Esc is ignored when canBack is false", async () => {
    const em = fakeTty();
    const p = select("Pick", ["a", "b"], { input: em, output: sink });
    press(em, "escape");
    press(em, "return");
    expect(await p).toBe(0);
  });
});
