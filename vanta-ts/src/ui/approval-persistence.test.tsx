import { createElement as h } from "react";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalPrompt, decide } from "./approval-prompt.js";
import { renderUi, waitForFrame, waitUntil } from "./test-render.js";

describe("terminal persistent approval failures", () => {
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-tui-permission-"));
    vi.stubEnv("VANTA_HOME", home);
    await mkdir(join(home, "permissions.tsv"));
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(home, { recursive: true, force: true });
  });

  it.each(["always", "never"] as const)("does not silently turn %s into a one-time choice", async (outcome) => {
    const pending = { action: "read public page", reason: "review", toolName: "browser_read", resolve: vi.fn() };
    await expect(decide(pending, outcome)).rejects.toThrow("Could not save the approval rule");
    expect(pending.resolve).not.toHaveBeenCalled();
  });

  it("shows the save error and lets the operator explicitly deny instead", async () => {
    const pending = { action: "read public page", reason: "review", toolName: "browser_read", resolve: vi.fn() };
    const onDone = vi.fn();
    const ui = renderUi(h(ApprovalPrompt, { pending, onDone }));
    try {
      await waitForFrame(ui, "don't ask again");
      ui.input("2");
      await waitForFrame(ui, "Could not save the approval rule");
      expect(pending.resolve).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
      ui.input("3");
      await waitUntil(() => pending.resolve.mock.calls.length > 0);
      expect(pending.resolve).toHaveBeenCalledExactlyOnceWith(false);
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally { ui.unmount(); }
  });
});
