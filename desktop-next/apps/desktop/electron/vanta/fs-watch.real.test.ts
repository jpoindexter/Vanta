import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PREVIEW_FILE_CHANGED_CHANNEL } from "../preview-file-watch";

import { createWatchRegistry } from "./fs-watch";
import { makeSandbox, type Sandbox, write } from "./project-test-helpers";

let box: Sandbox;

afterEach(() => box?.cleanup());

describe("watchDirectory on the real filesystem", () => {
  it("ticks when a file appears in the watched folder, and stops after stop()", async () => {
    box = makeSandbox();
    const registry = createWatchRegistry({ debounceMs: 20, guard: box.guard });
    const sent: unknown[][] = [];
    const owner = { isDestroyed: () => false, once: () => undefined, removeListener: () => undefined, send: (...args: unknown[]) => void sent.push(args) };

    const handle = (await registry.watchDirectory(owner as never, box.root)) as { id: string };
    write(path.join(box.root, "new.txt"), "x");
    await vi.waitFor(() => expect(sent.length).toBeGreaterThanOrEqual(1), { timeout: 5000 });

    expect(sent[0]?.[0]).toBe(PREVIEW_FILE_CHANGED_CHANNEL);
    expect(registry.stop(handle.id)).toBe(true);
  });
});
