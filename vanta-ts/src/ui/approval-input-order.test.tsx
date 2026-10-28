import { createElement as h } from "react";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApprovalPrompt } from "./approval-prompt.js";
import { renderUi, waitForFrame, waitUntil } from "./test-render.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-approval-input-"));
  vi.stubEnv("VANTA_HOME", home);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(home, { recursive: true }); });

it.each([
  { keys: "\x1b[B\r", decision: true, rule: "allow" },
  { keys: "\x1b[B\x1b[B\r", decision: false, rule: undefined },
  { keys: "\x1b[A\r", decision: false, rule: "deny" },
  { keys: "\x1b[B\x1b[A\r", decision: true, rule: undefined },
])("uses the latest selected row for a single input burst $keys", async ({ keys, decision, rule }) => {
  const pending = { action: "read public fixture", reason: "review", toolName: "browser_read", root: home, resolve: vi.fn() };
  const done = vi.fn(), ui = renderUi(h(ApprovalPrompt, { pending, onDone: done }));
  try {
    await waitForFrame(ui, "don't ask again");
    ui.input(keys);
    await waitUntil(() => pending.resolve.mock.calls.length > 0);
    expect(pending.resolve).toHaveBeenCalledExactlyOnceWith(decision);
    expect(done).toHaveBeenCalledTimes(1);
    const file = join(home, "permissions.tsv");
    expect(existsSync(file)).toBe(Boolean(rule));
    if (rule) expect(readFileSync(file, "utf8")).toBe(`${rule}\tbrowser_read\t\t${realpathSync(home)}`);
  } finally { ui.unmount(); }
});

it("rapid navigation cannot select a persistent outcome in a fresh one-time prompt", async () => {
  const pending = { action: "read public fixture", reason: "review", toolName: "browser_read", fresh: true, resolve: vi.fn() };
  const ui = renderUi(h(ApprovalPrompt, { pending, onDone: vi.fn() }));
  try {
    await waitForFrame(ui, "Yes, just once");
    ui.input("\x1b[B\r");
    await waitUntil(() => pending.resolve.mock.calls.length > 0);
    expect(pending.resolve).toHaveBeenCalledExactlyOnceWith(false);
    expect(existsSync(join(home, "permissions.tsv"))).toBe(false);
  } finally { ui.unmount(); }
});
