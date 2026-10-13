import { EventEmitter } from "node:events";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PREVIEW_FILE_CHANGED_CHANNEL } from "../preview-file-watch";

import { createWatchRegistry, MAX_WATCHES_PER_WINDOW, WATCH_DEBOUNCE_MS } from "./fs-watch";
import { makeSandbox, type Sandbox, write } from "./project-test-helpers";

let box: Sandbox;

class FakeOwner extends EventEmitter {
  sent: unknown[][] = [];
  destroyed = false;
  isDestroyed = () => this.destroyed;
  send = (...args: unknown[]) => void this.sent.push(args);
}

function setup() {
  const listeners: Array<(event: string, filename: null | string) => void> = [];
  const closed = vi.fn();

  const registry = createWatchRegistry({
    guard: box.guard,
    watch: (_dir, listener) => {
      listeners.push(listener);

      return { close: closed };
    }
  });

  return { closed, fire: (name: null | string = null) => listeners.forEach(listener => listener("change", name)), listeners, registry };
}

beforeEach(() => {
  box = makeSandbox();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  box.cleanup();
});

describe("watchDirectory", () => {
  it("sends one debounced change tick to the window that asked", async () => {
    const { fire, registry } = setup();
    const owner = new FakeOwner();

    const handle = await registry.watchDirectory(owner as never, box.root);

    expect(handle).toMatchObject({ path: box.root });
    fire("a.txt");
    fire("b.txt");
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS + 1);

    expect(owner.sent).toHaveLength(1);
    expect(owner.sent[0]?.[0]).toBe(PREVIEW_FILE_CHANGED_CHANNEL);
    expect(owner.sent[0]?.[1]).toMatchObject({ id: (handle as { id: string }).id, path: box.root });
  });

  it("refuses a folder outside the project without opening a watcher", async () => {
    const { listeners, registry } = setup();

    expect(await registry.watchDirectory(new FakeOwner() as never, box.outside)).toMatchObject({ error: "outside-project", ok: false });
    expect(listeners).toHaveLength(0);
  });

  it("refuses a file and a secret folder", async () => {
    const { registry } = setup();
    write(path.join(box.root, "f.txt"), "x");
    write(path.join(box.root, ".ssh", "k"), "x");

    expect(await registry.watchDirectory(new FakeOwner() as never, path.join(box.root, "f.txt"))).toMatchObject({ error: "ENOTDIR" });
    expect(await registry.watchDirectory(new FakeOwner() as never, path.join(box.root, ".ssh"))).toMatchObject({ error: "denied" });
  });

  it("caps the watchers one window can hold", async () => {
    const { registry } = setup();
    const owner = new FakeOwner();

    for (let count = 0; count < MAX_WATCHES_PER_WINDOW; count += 1) {
      expect(await registry.watchDirectory(owner as never, box.root)).toHaveProperty("id");
    }

    expect(await registry.watchDirectory(owner as never, box.root)).toMatchObject({ ok: false });
    expect(await registry.watchDirectory(new FakeOwner() as never, box.root)).toHaveProperty("id");
  });
});

describe("watchFile", () => {
  it("accepts a file:// URL and reports only changes to that file", async () => {
    const { fire, registry } = setup();
    const file = write(path.join(box.root, "doc.md"), "x");
    const owner = new FakeOwner();

    await registry.watchFile(owner as never, `file://${file}`);
    fire("other.md");
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS + 1);
    expect(owner.sent).toHaveLength(0);

    fire("doc.md");
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS + 1);
    expect(owner.sent).toHaveLength(1);
  });

  it("answers a structured missing result for a deleted file", async () => {
    const { registry } = setup();

    expect(await registry.watchFile(new FakeOwner() as never, path.join(box.root, "gone.md"))).toMatchObject({ error: "ENOENT", ok: false });
  });

  it("refuses a secret file and an outside file", async () => {
    const { registry } = setup();
    write(path.join(box.root, ".env"), "K=1");

    expect(await registry.watchFile(new FakeOwner() as never, path.join(box.root, ".env"))).toMatchObject({ error: "denied" });
    expect(await registry.watchFile(new FakeOwner() as never, path.join(box.outside, "secret.txt"))).toMatchObject({ error: "outside-project" });
  });
});

describe("closing", () => {
  it("stop closes one watcher and reports whether it existed", async () => {
    const { closed, registry } = setup();
    const handle = (await registry.watchDirectory(new FakeOwner() as never, box.root)) as { id: string };

    expect(registry.stop(handle.id)).toBe(true);
    expect(registry.stop(handle.id)).toBe(false);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("closes a window's watchers when that window is destroyed", async () => {
    const { closed, registry } = setup();
    const owner = new FakeOwner();

    await registry.watchDirectory(owner as never, box.root);
    owner.emit("destroyed");

    expect(closed).toHaveBeenCalledTimes(1);
    expect(registry.size()).toBe(0);
  });

  it("closeAll closes every watcher, as a project switch needs", async () => {
    const { closed, registry } = setup();

    await registry.watchDirectory(new FakeOwner() as never, box.root);
    await registry.watchDirectory(new FakeOwner() as never, box.root);
    registry.closeAll();

    expect(closed).toHaveBeenCalledTimes(2);
  });

  it("stops watching when the window died before the tick arrived", async () => {
    const { fire, registry } = setup();
    const owner = new FakeOwner();

    await registry.watchDirectory(owner as never, box.root);
    owner.destroyed = true;
    fire();
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS + 1);

    expect(owner.sent).toHaveLength(0);
    expect(registry.size()).toBe(0);
  });
});
