import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { Banner } from "./banner.js";
import { EntryView } from "./transcript.js";
import { SlashPalette } from "./slash-palette.js";
import { AtPalette } from "./at-palette.js";
import { OverlayList } from "./overlay-list.js";
import { CockpitPanel } from "./cockpit-panel.js";
import { HelpPanel } from "./help-panel.js";
import { TodoPanel } from "./todo-panel.js";
import { StatusBar } from "./status-bar.js";
import { matchSlash } from "./slash.js";
import { EMPTY_COCKPIT } from "../tui/mission-control/cockpit-data.js";

describe("Banner", () => {
  it("renders the name, model, and kernel line", async () => {
    const inst = renderUi(h(Banner, { model: "claude-sonnet-4-6", cwd: "~/dev/site", kernel: "127.0.0.1:7788", tools: 49, cmds: 41 }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("█"); // the VANTA block wordmark
    expect(out).toContain("local trusted operator");
    expect(out).toContain("claude-sonnet-4-6");
    expect(out).toContain("127.0.0.1:7788");
    expect(out).toContain("49 tools");
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

  it("renders a tool's diff inline with +/- lines", async () => {
    const diff = [{ type: "add" as const, text: "added me" }, { type: "remove" as const, text: "gone now" }];
    const inst = renderUi(h(EntryView, { entry: { kind: "tool", name: "write_file", verb: "wrote", detail: "y.ts", ok: true, diff } }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("+ added me");
    expect(out).toContain("- gone now");
    inst.unmount();
  });

  it("renders thinking as a dim multi-line panel", async () => {
    const inst = renderUi(h(EntryView, { entry: { kind: "thinking", text: "first thought\nsecond thought" } }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("thinking");
    expect(out).toContain("first thought");
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

describe("inline overlays", () => {
  const noop = (): void => {};
  it("OverlayList renders a title and rows", async () => {
    const rows = [{ label: "gpt-4o", hint: "openai", command: "/model openai" }];
    const inst = renderUi(h(OverlayList, { title: "Switch model", rows, onSelect: noop, onClose: noop }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Switch model");
    expect(out).toContain("gpt-4o");
    inst.unmount();
  });

  it("CockpitPanel renders the kernel verdict ladder", async () => {
    const inst = renderUi(h(CockpitPanel, { data: EMPTY_COCKPIT, onClose: noop }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Mission control");
    expect(out).toContain("allow");
    expect(out).toContain("block");
    inst.unmount();
  });

  it("HelpPanel renders the shortcut card", async () => {
    const inst = renderUi(h(HelpPanel, { onClose: noop }));
    await tick();
    expect(inst.lastFrame()).toContain("Shortcuts");
    inst.unmount();
  });

  it("TodoPanel renders the plan with a done count", async () => {
    const todos = [{ text: "ship it", status: "in_progress" as const }, { text: "done thing", status: "done" as const }];
    const inst = renderUi(h(TodoPanel, { todos }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("plan · 1/2 done");
    expect(out).toContain("ship it");
    inst.unmount();
  });

  it("TodoPanel renders nothing for an empty plan", async () => {
    const inst = renderUi(h(TodoPanel, { todos: [] }));
    await tick();
    expect(inst.lastFrame().trim()).toBe("");
    inst.unmount();
  });
});

describe("StatusBar", () => {
  it("shows model, a context gauge, turns, and the interrupt hint when busy", async () => {
    const inst = renderUi(h(StatusBar, { model: "claude-sonnet-4-6", ctxPct: 12, tokens: 24000, contextWindow: 200000, turns: 3, busy: true }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("claude-sonnet-4-6");
    expect(out).toContain("24k/200k");
    expect(out).toContain("12%");
    expect(out).toContain("█"); // context bar
    expect(out).toContain("3 turns");
    expect(out).toContain("esc to interrupt");
    inst.unmount();
  });

  it("shows the shortcuts hint when idle", async () => {
    const inst = renderUi(h(StatusBar, { model: "gpt-4o", ctxPct: 0, tokens: 0, contextWindow: 128000, turns: 1, busy: false }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("1 turn");
    expect(out).toContain("? shortcuts");
    inst.unmount();
  });
});
