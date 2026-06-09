import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { SessionsPicker, buildSessionRows, formatWhen } from "./sessions-picker.js";
import type { SessionMeta } from "../sessions/store.js";

const meta = (id: string, over: Partial<SessionMeta> = {}): SessionMeta => ({
  id,
  title: `title ${id}`,
  started: "2026-06-01T10:00:00.000Z",
  updated: "2026-06-01T10:00:00.000Z",
  turns: 3,
  ...over,
});

const KEY = { down: "[B", up: "[A", enter: "\r", esc: "" };
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

describe("buildSessionRows", () => {
  it("puts live + new first, then saved sessions minus the current one", () => {
    const rows = buildSessionRows([meta("a"), meta("cur"), meta("b")], "cur", 6);
    expect(rows.map((r) => r.kind)).toEqual(["live", "new", "session", "session"]);
    expect(rows.filter((r) => r.kind === "session").map((r) => (r as { meta: SessionMeta }).meta.id)).toEqual(["a", "b"]);
    expect(rows[0]).toEqual({ kind: "live", turns: 6 });
  });
});

describe("formatWhen", () => {
  const now = Date.parse("2026-06-03T10:00:00.000Z");
  it("buckets into today / yesterday / Nd ago", () => {
    expect(formatWhen("2026-06-03T09:00:00.000Z", now)).toBe("today");
    expect(formatWhen("2026-06-02T09:00:00.000Z", now)).toBe("yesterday");
    expect(formatWhen("2026-05-31T09:00:00.000Z", now)).toBe("3d ago");
    expect(formatWhen("not-a-date", now)).toBe("—");
  });
});

describe("SessionsPicker keyboard", () => {
  const base = {
    sessions: [meta("a"), meta("b")],
    currentId: "cur",
    currentTurns: 4,
    nowMs: Date.parse("2026-06-03T10:00:00.000Z"),
    width: 80,
  };

  it("renders the live, new and saved rows", () => {
    const { lastFrame, unmount } = render(
      <SessionsPicker {...base} onResume={() => {}} onNew={() => {}} onDelete={() => {}} onCancel={() => {}} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Sessions");
    expect(frame).toContain("live");
    expect(frame).toContain("New session");
    expect(frame).toContain("a");
    unmount();
  });

  it("⏎ on a saved session resumes it (down twice past live + new)", async () => {
    const onResume = vi.fn();
    const { stdin, unmount } = render(
      <SessionsPicker {...base} onResume={onResume} onNew={() => {}} onDelete={() => {}} onCancel={() => {}} />,
    );
    stdin.write(KEY.down);
    await tick();
    stdin.write(KEY.down);
    await tick();
    stdin.write(KEY.enter);
    await tick();
    expect(onResume).toHaveBeenCalledWith("a");
    unmount();
  });

  it("⏎ on the new-session row starts fresh", async () => {
    const onNew = vi.fn();
    const { stdin, unmount } = render(
      <SessionsPicker {...base} onResume={() => {}} onNew={onNew} onDelete={() => {}} onCancel={() => {}} />,
    );
    stdin.write(KEY.down);
    await tick();
    stdin.write(KEY.enter);
    await tick();
    expect(onNew).toHaveBeenCalledOnce();
    unmount();
  });

  it("d deletes the highlighted saved session", async () => {
    const onDelete = vi.fn();
    const { stdin, unmount } = render(
      <SessionsPicker {...base} onResume={() => {}} onNew={() => {}} onDelete={onDelete} onCancel={() => {}} />,
    );
    stdin.write(KEY.down);
    await tick();
    stdin.write(KEY.down);
    await tick();
    stdin.write("d");
    await tick();
    expect(onDelete).toHaveBeenCalledWith("a");
    unmount();
  });

  it("Esc cancels", async () => {
    const onCancel = vi.fn();
    const { stdin, unmount } = render(
      <SessionsPicker {...base} onResume={() => {}} onNew={() => {}} onDelete={() => {}} onCancel={onCancel} />,
    );
    stdin.write(KEY.esc);
    await tick();
    expect(onCancel).toHaveBeenCalledOnce();
    unmount();
  });
});
