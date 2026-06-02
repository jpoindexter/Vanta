import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { useState } from "react";
import { Composer } from "./composer.js";

// Harness: a controlled wrapper that owns `value`, exactly like app.tsx does.
function Harness({ initial = "", onSubmit }: { initial?: string; onSubmit?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return <Composer value={value} onChange={setValue} onSubmit={onSubmit ?? (() => {})} placeholder="type here" />;
}

const tick = () => new Promise((r) => setTimeout(r, 10));

describe("Composer", () => {
  it("shows the placeholder when empty", () => {
    const { lastFrame } = render(<Harness />);
    expect(lastFrame()).toContain("type here");
  });

  it("inserts typed characters", async () => {
    const { stdin, lastFrame } = render(<Harness />);
    stdin.write("hello");
    await tick();
    expect(lastFrame()).toContain("hello");
  });

  it("Ctrl+U clears the whole line", async () => {
    const { stdin, lastFrame } = render(<Harness initial="some text" />);
    expect(lastFrame()).toContain("some text");
    stdin.write("\x15"); // Ctrl+U (NAK)
    await tick();
    expect(lastFrame()).toContain("type here"); // back to placeholder
    expect(lastFrame()).not.toContain("some text");
  });

  it("Ctrl+W deletes the previous word (keeping the leading space)", async () => {
    let submitted = "";
    const { stdin } = render(<Harness onSubmit={(v) => (submitted = v)} />);
    stdin.write("foo bar");
    await tick();
    stdin.write("\x17"); // Ctrl+W (ETB)
    await tick();
    stdin.write("\r"); // submit to read the exact value (frames trim trailing space)
    await tick();
    expect(submitted).toBe("foo ");
  });

  it("backspace deletes one char", async () => {
    const { stdin, lastFrame } = render(<Harness />);
    stdin.write("abc");
    await tick();
    stdin.write("\x7f"); // DEL / backspace
    await tick();
    expect(lastFrame()).toContain("ab");
    expect(lastFrame()).not.toContain("abc");
  });

  it("Enter submits the current value", async () => {
    let submitted = "";
    const { stdin } = render(<Harness initial="run this" onSubmit={(v) => (submitted = v)} />);
    stdin.write("\r");
    await tick();
    expect(submitted).toBe("run this");
  });
});
