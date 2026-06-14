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
const noAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("renderMenu (Hermes look)", () => {
  it("cursor row is ` → (●) label`; others are `   (○) label`", () => {
    const f = noAnsi(renderMenu("Pick", ["a", "b", "c"], 1, { canBack: true }));
    expect(f).toContain(" → (●) b");
    expect(f).toContain("   (○) a");
    expect(f).toContain("ENTER/SPACE select");
    expect(f).toContain("ESC back");
  });
  it("shows ESC cancel when not canBack", () => {
    expect(renderMenu("Pick", ["a"], 0, {})).toContain("ESC cancel");
  });
  it("annotates the currently-active row", () => {
    expect(renderMenu("Pick", ["a", "b"], 0, { current: 1 })).toContain("← currently active");
  });
  it("clips a long row to the width so it never wraps", () => {
    const f = renderMenu("t", ["x".repeat(200)], 0, { width: 40 });
    const row = noAnsi(f.split("\n").find((l) => l.includes("x")) ?? "");
    expect([...row].length).toBeLessThanOrEqual(40);
    expect(row.endsWith("…")).toBe(true);
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

  it("Space also selects", async () => {
    const em = fakeTty();
    const p = select("Pick", ["a", "b"], { input: em, output: sink });
    press(em, "down");
    press(em, "space");
    expect(await p).toBe(1);
  });

  it("up from the top wraps to the last option", async () => {
    const em = fakeTty();
    const p = select("Pick", ["a", "b", "c"], { input: em, output: sink });
    press(em, "up");
    press(em, "return");
    expect(await p).toBe(2);
  });

  it("Esc cancels (−1) regardless of canBack", async () => {
    const a = fakeTty();
    const p1 = select("Pick", ["a", "b"], { input: a, output: sink, canBack: true });
    press(a, "escape");
    expect(await p1).toBe(-1);
    const b = fakeTty();
    const p2 = select("Pick", ["a", "b"], { input: b, output: sink });
    press(b, "escape");
    expect(await p2).toBe(-1);
  });
});
