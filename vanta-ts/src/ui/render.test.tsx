import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { Banner } from "./banner.js";
import { EntryView } from "./transcript.js";
import { SlashPalette } from "./slash-palette.js";
import { AtPalette } from "./at-palette.js";
import { matchSlash } from "./slash.js";

describe("Banner", () => {
  it("renders the name, model, and kernel line", async () => {
    const inst = renderUi(h(Banner, { model: "claude-sonnet-4-6", cwd: "~/dev/site", kernel: "127.0.0.1:7788" }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Vanta");
    expect(out).toContain("claude-sonnet-4-6");
    expect(out).toContain("127.0.0.1:7788");
    inst.unmount();
  });
});

describe("EntryView", () => {
  it("renders a user line with the ❯ glyph", async () => {
    const inst = renderUi(h(EntryView, { entry: { kind: "user", text: "hello" } }));
    await tick();
    expect(inst.lastFrame()).toContain("❯ hello");
    inst.unmount();
  });

  it("renders a completed tool with a ✓ mark and summary", async () => {
    const inst = renderUi(h(EntryView, { entry: { kind: "tool", name: "read_file", verb: "read", detail: "x.ts", ok: true, summary: "48 lines" } }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("✓");
    expect(out).toContain("read x.ts");
    expect(out).toContain("48 lines");
    inst.unmount();
  });

  it("renders a failed tool with a ✗ mark and error line", async () => {
    const inst = renderUi(h(EntryView, { entry: { kind: "tool", name: "shell_cmd", verb: "ran", detail: "x", ok: false, errorLine: "boom" } }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("✗");
    expect(out).toContain("boom");
    inst.unmount();
  });
});

describe("SlashPalette", () => {
  it("lists matching commands above the composer", async () => {
    const inst = renderUi(h(SlashPalette, { matches: matchSlash("/mod"), sel: 0 }));
    await tick();
    expect(inst.lastFrame()).toContain("/model");
    inst.unmount();
  });

  it("renders nothing when there are no matches", async () => {
    const inst = renderUi(h(SlashPalette, { matches: [], sel: 0 }));
    await tick();
    expect(inst.lastFrame().trim()).toBe("");
    inst.unmount();
  });
});

describe("AtPalette", () => {
  it("lists matching files with the @ glyph", async () => {
    const inst = renderUi(h(AtPalette, { files: ["src/app.ts", "src/composer.tsx"], sel: 0 }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("@src/app.ts");
    expect(out).toContain("@src/composer.tsx");
    inst.unmount();
  });
});
