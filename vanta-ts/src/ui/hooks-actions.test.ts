import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHooksOverlay } from "./hooks-actions.js";
import type { OverlayView } from "./use-overlay.js";

process.env.VANTA_ENABLE_PROJECT_HOOKS = "1";

let root: string;
let latest: OverlayView | null;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-hooks-ui-"));
  latest = null;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("buildHooksOverlay", () => {
  it("persists add actions to .vanta/hooks.json and republishes the overlay", async () => {
    const view = await buildHooksOverlay(root, {
      isOpen: () => true,
      publish: (v) => { latest = v; },
    });
    expect(view.kind).toBe("hooks");
    if (view.kind !== "hooks") throw new Error("expected hooks overlay");
    view.onAction({ kind: "add", event: "SessionStart", hook: { type: "command", command: "echo start" } });

    for (let i = 0; i < 20 && !latest; i++) await new Promise((r) => setTimeout(r, 10));
    const raw = JSON.parse(await readFile(join(root, ".vanta", "hooks.json"), "utf8")) as { SessionStart?: unknown[] };
    expect(raw.SessionStart).toEqual([{ type: "command", command: "echo start" }]);
    expect(latest?.kind).toBe("hooks");
  });
});
