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

  it("Ctrl+K kills to end and Ctrl+Y yanks it back (kill ring)", async () => {
    let submitted = "";
    const { stdin } = render(<Harness initial="hello world" onSubmit={(v) => (submitted = v)} />);
    stdin.write("\x01"); // Ctrl+A → cursor to start
    await tick();
    stdin.write("\x0b"); // Ctrl+K → kill "hello world", ring holds it
    await tick();
    stdin.write("\x19"); // Ctrl+Y → yank it back
    await tick();
    stdin.write("\r");
    await tick();
    expect(submitted).toBe("hello world");
  });

  it("Ctrl+D forward-deletes; on empty input it is a no-op (does not submit/exit)", async () => {
    let submits = 0;
    const { stdin, lastFrame } = render(<Harness onSubmit={() => submits++} />);
    stdin.write("\x04"); // Ctrl+D on empty input → no-op
    await tick();
    expect(submits).toBe(0);
    expect(lastFrame()).toContain("type here"); // still the placeholder
    stdin.write("abc");
    await tick();
    stdin.write("\x01"); // Ctrl+A → cursor to start
    await tick();
    stdin.write("\x04"); // Ctrl+D → delete "a"
    await tick();
    expect(lastFrame()).toContain("bc");
    expect(lastFrame()).not.toContain("abc");
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

  // Paste contract (guards the usePaste path). NOTE: ink-testing-library delivers
  // a paste atomically, so it CANNOT reproduce the real-TTY multi-submit ("repasted
  // several times") — that root cause (bracketed paste disabled → \r read as Enter)
  // is fixed by usePaste and verified by pasting in a real terminal. These guard the
  // unit contract: a paste round-trips as ONE insert with zero spurious submits.
  it("a bracketed paste inserts once and never submits on its newlines", async () => {
    let submits = 0;
    const { stdin, lastFrame } = render(<Harness onSubmit={() => submits++} />);
    stdin.write("[200~one\ntwo\nthree[201~"); // 3-line bracketed paste
    await tick();
    expect(submits).toBe(0); // newlines inside a paste must NOT trigger submit
    expect(lastFrame()).toContain("one"); // the paste was inserted, not dropped
  });

  it("a large bracketed paste collapses to a ref and round-trips on submit", async () => {
    let submitted = "";
    const big = Array.from({ length: 8 }, (_, i) => `line ${i} of a pasted block`).join("\n");
    const { stdin, lastFrame } = render(<Harness onSubmit={(v) => (submitted = v)} />);
    stdin.write(`[200~${big}[201~`);
    await tick();
    expect(lastFrame()).toContain("Pasted text #1"); // collapsed — composer stays readable
    stdin.write("\r"); // single Enter
    await tick();
    expect(submitted).toBe(big); // expands back to the full text, one submit
  });
});
