import { createElement as h, useEffect } from "react";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveBody } from "./app-body.js";
import { useOverlay, type OverlayView } from "./use-overlay.js";
import { openSettingsView, settingsErrorMessage } from "./settings-recovery.js";
import { renderUi, waitForFrame, waitUntil, type UiTestInstance } from "./test-render.js";
import type { RunSetup } from "../session.js";

let fixture: string, root: string, target: string;
let latest: OverlayView | null;
let inst: UiTestInstance | undefined;
const noop = (): void => {};
beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), "vanta-settings-recovery-ui-")); root = join(fixture, "project");
  await mkdir(join(root, ".vanta"), { recursive: true });
  target = join(root, ".vanta", "settings.local.json"); latest = null;
  vi.stubEnv("VANTA_HOME", join(fixture, "home")); vi.stubEnv("HOME", join(fixture, "home"));
});
afterEach(async () => { inst?.unmount(); inst = undefined; vi.unstubAllEnvs(); await rm(fixture, { recursive: true, force: true }); });

function Harness(props: { kind: "config" | "sandbox" }) {
  const controls = useOverlay({ setup: {} as RunSetup, repoRoot: root, runSlash: noop });
  latest = controls.overlay;
  useEffect(() => controls.openOverlay(props.kind), []);
  return h(LiveBody, {
    quickOpen: false, globalSearch: false, messageActions: false, searchSessions: [], entries: [],
    overlay: controls.overlay, pending: null, mode: "default", focus: "overlay-list", todos: [],
    files: [], history: [], skills: [], channels: [], vim: false, promptSuggestions: [],
    onQuickActivate: noop, onQuickClose: noop, onSearchSelect: noop, onSearchClose: noop,
    onMessageRetry: noop, onMessageBranch: noop, onMessageNote: noop, onMessageClose: noop,
    onSubmit: noop, onPaste: noop, onSelect: controls.selectRow, onClose: controls.closeOverlay,
  });
}

describe("settings recovery through real Ink and persistence collaborators", () => {
  it.each(["config", "sandbox"] as const)("keeps %s values visible when a late save is rejected", async (kind) => {
    await writeFile(target, '{"effortLevel":"medium","sandbox":{"enabled":false}}');
    inst = renderUi(h(Harness, { kind }), { cols: 120 });
    await waitUntil(() => latest?.kind === kind);
    const before = latest;
    await writeFile(target, '{"blockedTools":');
    inst.input("\r");
    await waitForFrame(inst, "Couldn't confirm the change", 100);
    expect(latest?.kind).toBe(kind);
    expect(latest && "state" in latest ? latest.state : null).toEqual(before && "state" in before ? before.state : null);
    expect(inst.lastFrame()).toContain("Previous values are still shown");
    expect(inst.lastFrame()).toContain(target);
    expect(await readFile(target, "utf8")).toBe('{"blockedTools":');
    await writeFile(target, '{"effortLevel":"medium","sandbox":{"enabled":false}}');
    inst.input("\r");
    await waitUntil(() => latest?.kind === "config" ? latest.state.effort === "high" : latest?.kind === "sandbox" && latest.state.enabled);
    expect(latest && "error" in latest ? latest.error : undefined).toBeUndefined();
    inst.input("\x1b"); await waitUntil(() => latest === null);
  });

  it.each(["config", "sandbox"] as const)("shows a persistent recovery panel when %s cannot open", async (kind) => {
    await writeFile(target, '{"blockedTools":false}');
    inst = renderUi(h(Harness, { kind }), { cols: 120 });
    await waitForFrame(inst, "Couldn't open settings", 100);
    expect(inst.lastFrame()).toContain(target);
    expect(inst.lastFrame()).toContain(`reopen /${kind}`);
    expect(await readFile(target, "utf8")).toBe('{"blockedTools":false}');
    inst.input("\x1b"); await waitUntil(() => latest === null);
  });

});

describe("settings recovery publication lifecycle", () => {
  it("does not turn a failed post-save reload into a no-write claim", () => {
    expect(settingsErrorMessage(new Error("Settings need recovery at /synthetic/settings.json; nothing was written.")))
      .toBe("Settings need recovery at /synthetic/settings.json.");
  });

  it.each(["resolve", "reject"] as const)("does not resurrect a settings load after navigation on %s", async (result) => {
    let current: OverlayView | null = null, calls = 0;
    let resolve!: (view: OverlayView) => void, reject!: (error: Error) => void;
    const loading = new Promise<OverlayView>((yes, no) => { resolve = yes; reject = no; });
    openSettingsView("/config", () => loading, (next) => { calls++; current = typeof next === "function" ? next(current) : next; });
    const moved: OverlayView = { kind: "list", title: "Another view", rows: [] }; current = moved;
    if (result === "resolve") resolve({ kind: "help" }); else reject(new Error("synthetic recovery"));
    await waitUntil(() => calls > 1);
    expect(current).toBe(moved);
  });

  it("does not let an old settings callback replace a reopened view", async () => {
    let current: OverlayView | null = null, update!: (view: OverlayView) => void, calls = 0;
    const original: OverlayView = { kind: "list", title: "First view", rows: [] };
    openSettingsView("/config", async (publish) => { update = publish; return original; },
      (next) => { calls++; current = typeof next === "function" ? next(current) : next; });
    await waitUntil(() => calls > 1);
    const reopened: OverlayView = { kind: "list", title: "Reopened view", rows: [] }; current = reopened;
    update({ kind: "settingsRecovery", command: "/config", error: "late recovery" });
    expect(current).toBe(reopened);
  });
});
