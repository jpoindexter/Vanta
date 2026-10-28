import { createElement as h, type Dispatch, type SetStateAction } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ApprovalPrompt, decide } from "./approval-prompt.js";
import { requestApprovalWithTaskScope, TaskApprovalScope, type Pending } from "./task-approval.js";
import { renderUi, tick, waitForFrame, waitUntil } from "./test-render.js";

const grants = vi.hoisted(() => ({ always: vi.fn(), never: vi.fn() }));
vi.mock("./grant.js", () => ({ grantAlways: grants.always, grantNever: grants.never }));
afterEach(() => { vi.restoreAllMocks(); grants.always.mockReset(); grants.never.mockReset(); });
const edit = { action: "edit file src/private.ts", reason: "private reversible change", toolName: "edit_file" };

function host() {
  let pending: Pending | null = null;
  const setPending: Dispatch<SetStateAction<Pending | null>> = next => {
    pending = typeof next === "function" ? next(pending) : next;
  };
  const scope = new TaskApprovalScope();
  const ask = (signal?: AbortSignal | null) => requestApprovalWithTaskScope({
    ...edit, taskApprovals: scope, setPending, detail: { signal },
  });
  return { ask, scope, current: () => pending };
}

it.each([false, true])("rejects an already stopped request before prompting or reusing a task grant=%s", async granted => {
  const f = host(), controller = new AbortController(); controller.abort();
  if (granted) f.scope.grant(edit);
  const result = f.ask(controller.signal);
  try {
    expect(f.current()).toBeNull();
    await expect(result).resolves.toBe(false);
  } finally { f.current()?.resolve(false); }
});

it("aborting an unanswered prompt settles false and removes its listener", async () => {
  const f = host(), controller = new AbortController();
  const removed = vi.spyOn(controller.signal, "removeEventListener");
  const result = f.ask(controller.signal); let settled: boolean | undefined;
  void result.then(value => { settled = value; });
  try {
    controller.abort();
    await vi.waitFor(() => expect(settled).toBe(false));
    expect(f.current()).toBeNull();
    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
  } finally { f.current()?.resolve(false); }
});

it("a stale cancellation never dismisses a newer prompt", async () => {
  const f = host(), first = new AbortController(), second = new AbortController();
  const firstResult = f.ask(first.signal), old = f.current()!;
  const secondResult = f.ask(second.signal), current = f.current()!;
  let settled: boolean | undefined; void firstResult.then(value => { settled = value; });
  try {
    first.abort();
    await vi.waitFor(() => expect(settled).toBe(false));
    expect(f.current()).toBe(current);
    await decide(old, "always");
    expect(grants.always).not.toHaveBeenCalled();
    expect(f.current()).toBe(current);
  } finally { old.resolve(false); current.resolve(false); await Promise.all([firstResult, secondResult]); }
});

it.each(["always", "never", "task", "allow"] as const)("a cancelled prompt cannot apply a stale %s choice", async choice => {
  const f = host(), controller = new AbortController();
  const result = f.ask(controller.signal), old = f.current()!;
  controller.abort();
  await decide(old, choice);
  old.grantTask?.();
  expect(grants.always).not.toHaveBeenCalled(); expect(grants.never).not.toHaveBeenCalled();
  expect(f.scope.allows(edit)).toBe(false);
  old.resolve(true);
  await expect(result).resolves.toBe(false);
});

it("a normally resolved prompt releases its cancellation listener", async () => {
  const f = host(), controller = new AbortController();
  const removed = vi.spyOn(controller.signal, "removeEventListener");
  const result = f.ask(controller.signal), pending = f.current()!;
  await decide(pending, "allow");
  await expect(result).resolves.toBe(true);
  expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
  controller.abort();
  await expect(result).resolves.toBe(true);
});

it("explicit detached requests remain usable without a foreground lifetime", async () => {
  const f = host();
  const result = f.ask(null), pending = f.current()!;
  await decide(pending, "task");
  await expect(result).resolves.toBe(true);
  expect(f.scope.allows(edit)).toBe(true);
});

it.each(["2", "4"])("a stale rendered persistent choice %s cannot save or dismiss a newer prompt", async key => {
  const f = host(), controller = new AbortController();
  const result = f.ask(controller.signal), old = f.current()!;
  const done = vi.fn(), ui = renderUi(h(ApprovalPrompt, { pending: old, onDone: done }));
  let next: Promise<boolean> | undefined;
  try {
    await waitForFrame(ui, "Never allow this tool");
    controller.abort(); next = f.ask(); const current = f.current();
    ui.input(key);
    await new Promise(resolve => setTimeout(resolve, 40)); // Negative stale-input assertions.
    expect(grants.always).not.toHaveBeenCalled(); expect(grants.never).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled(); expect(f.current()).toBe(current);
    await expect(result).resolves.toBe(false);
  } finally { old.resolve(false); f.current()?.resolve(false); await next; ui.unmount(); }
});

it("an in-flight save cannot approve after cancellation or close a newer rendered prompt", async () => {
  let finish!: () => void;
  const saved = new Promise<void>(resolve => { finish = resolve; });
  grants.always.mockReturnValue(saved);
  const f = host(), controller = new AbortController();
  const result = f.ask(controller.signal), old = f.current()!;
  const done = vi.fn();
  const ui = renderUi(h(ApprovalPrompt, { pending: old, onDone: done }));
  let next: Promise<boolean> | undefined;
  try {
    await waitForFrame(ui, "don't ask again"); ui.input("2");
    await waitUntil(() => grants.always.mock.calls.length === 1);
    controller.abort(); next = f.ask(); const current = f.current();
    finish(); await saved; await tick(); // Negative assertion after the started save settles.
    expect(done).not.toHaveBeenCalled();
    await expect(result).resolves.toBe(false);
    expect(f.current()).toBe(current);
  } finally { finish?.(); old.resolve(false); f.current()?.resolve(false); await next; ui.unmount(); }
});
