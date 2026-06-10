import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { Text } from "ink";
import { AltFrame } from "./alt-frame.js";

const frameOf = (lastFrame: () => string | undefined): string => (lastFrame() ?? "").replace(/\n$/, "");

describe("AltFrame", () => {
  it("renders a full viewport of filler above the content, so every frame overflows the terminal", () => {
    const { lastFrame, unmount } = render(
      <AltFrame rows={10} nonce={0} viewport={<Text>history</Text>} chrome={<Text>composer</Text>} />,
    );
    const lines = frameOf(lastFrame).split("\n");
    expect(lines).toHaveLength(12); // 10 filler + viewport + chrome
    expect(lines.slice(0, 10).every((l) => l.trim() === "")).toBe(true);
    unmount();
  });

  it("orders content as viewport above chrome, at the very bottom of the frame", () => {
    const { lastFrame, unmount } = render(
      <AltFrame rows={10} nonce={0} viewport={<Text>history</Text>} chrome={<Text>composer</Text>} />,
    );
    const lines = frameOf(lastFrame).split("\n");
    expect(lines[lines.length - 1]).toContain("composer");
    expect(lines[lines.length - 2]).toContain("history");
    unmount();
  });

  it("never shrinks the filler when the content is tall — overflow survives any content height", () => {
    const tall = Array.from({ length: 20 }, (_, i) => `line-${i}`).join("\n");
    const { lastFrame, unmount } = render(
      <AltFrame rows={8} nonce={0} viewport={<Text>{tall}</Text>} chrome={<Text>composer</Text>} />,
    );
    const lines = frameOf(lastFrame).split("\n");
    expect(lines).toHaveLength(8 + 20 + 1); // filler + viewport + chrome, nothing collapsed
    expect(lines[lines.length - 1]).toContain("composer");
    unmount();
  });

  it("changes the frame string when the nonce toggles, so a post-resize redraw is never skipped", () => {
    const even = render(<AltFrame rows={5} nonce={0} viewport={<Text>x</Text>} chrome={<Text>y</Text>} />);
    const odd = render(<AltFrame rows={5} nonce={1} viewport={<Text>x</Text>} chrome={<Text>y</Text>} />);
    expect(even.lastFrame()).not.toBe(odd.lastFrame());
    even.unmount();
    odd.unmount();
  });
});
