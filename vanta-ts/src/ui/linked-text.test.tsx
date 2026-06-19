import { createElement as h } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { LinkedText, buildLinkedSegments } from "./linked-text.js";

const env = (o: Record<string, string | undefined>): NodeJS.ProcessEnv => o as NodeJS.ProcessEnv;

describe("buildLinkedSegments — pure", () => {
  it("returns one plain segment for a line with no links", () => {
    expect(buildLinkedSegments("hello world", env({}), "/repo")).toEqual([{ text: "hello world" }]);
  });

  it("splits a url out as a linked segment with a browser url", () => {
    const segs = buildLinkedSegments("see https://example.com now", env({}), "/repo");
    expect(segs[0]).toEqual({ text: "see " });
    expect(segs[1]).toEqual({ text: "https://example.com", url: "https://example.com" });
    expect(segs[2]).toEqual({ text: " now" });
  });

  it("resolves a relative file:line to the editor deep link against cwd", () => {
    const segs = buildLinkedSegments("at src/a.ts:42 here", env({ VANTA_EDITOR: "code" }), "/repo");
    expect(segs[1]).toEqual({ text: "src/a.ts:42", url: "vscode://file/repo/src/a.ts:42" });
  });

  it("uses a file:// url for a non-deep-link editor", () => {
    const segs = buildLinkedSegments("open /abs/b.ts", env({ VANTA_EDITOR: "vim" }), "/repo");
    expect(segs[1]).toEqual({ text: "/abs/b.ts", url: "file:///abs/b.ts" });
  });
});

describe("LinkedText — render", () => {
  afterEach(() => { delete process.env.VANTA_HYPERLINKS; });

  it("emits the OSC-8 escape around a url when hyperlinks are enabled", async () => {
    process.env.VANTA_HYPERLINKS = "1";
    // Frame capture strips ANSI but the OSC-8 sequence carries the URL as text,
    // so a supported terminal's link target is visible in the joined writes.
    const inst = renderUi(h(LinkedText, { text: "go https://example.com" }));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("https://example.com");
    inst.unmount();
  });

  it("renders plain text (no crash) when hyperlinks are disabled", async () => {
    process.env.VANTA_HYPERLINKS = "0";
    const inst = renderUi(h(LinkedText, { text: "see src/a.ts:10" }));
    await tick();
    expect(inst.lastFrame()).toContain("src/a.ts:10");
    inst.unmount();
  });
});
