import { describe, it, expect, vi } from "vitest";
import { render } from "./test-render.js";
import { ThemePicker } from "./theme-picker.js";

const KEY = { down: "\x1b[B", up: "\x1b[A", enter: "\r", esc: "\x1b" };
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 70)); // > the parser's 50ms lone-Esc flush

describe("ThemePicker", () => {
  const base = { current: "default", width: 60 };

  it("lists every real theme name", () => {
    const { lastFrame, unmount } = render(<ThemePicker {...base} onApply={() => {}} onClose={() => {}} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("default");
    expect(frame).toContain("high-contrast");
    expect(frame).toContain("muted");
    expect(frame).toContain("dyslexia");
    unmount();
  });

  it("applies the current theme on open (live-preview effect, no-op)", async () => {
    const onApply = vi.fn();
    const { unmount } = render(<ThemePicker {...base} onApply={onApply} onClose={() => {}} />);
    await tick();
    expect(onApply).toHaveBeenCalledWith("default");
    unmount();
  });

  it("previews the next theme live when you arrow down", async () => {
    const onApply = vi.fn();
    const { stdin, unmount } = render(<ThemePicker {...base} onApply={onApply} onClose={() => {}} />);
    await tick();
    stdin.write(KEY.down);
    await tick();
    expect(onApply).toHaveBeenLastCalledWith("high-contrast"); // 2nd theme
    unmount();
  });

  it("⏎ keeps the highlighted theme and closes", async () => {
    const onClose = vi.fn();
    const { stdin, unmount } = render(<ThemePicker {...base} onApply={() => {}} onClose={onClose} />);
    await tick();
    stdin.write(KEY.down);
    await tick();
    stdin.write(KEY.enter);
    await tick();
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
  });

  it("Esc reverts to the theme it opened with, then closes", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const { stdin, unmount } = render(<ThemePicker current="muted" width={60} onApply={onApply} onClose={onClose} />);
    await tick();
    stdin.write(KEY.down); // preview some other theme
    await tick();
    stdin.write(KEY.esc);
    await tick();
    expect(onApply).toHaveBeenLastCalledWith("muted"); // reverted to the opened-with theme
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
  });
});
