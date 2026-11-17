import { expect, it, vi } from "vitest";
import { executionContext } from "./execution-context.js";
import type { AgentDeps } from "./agent-types.js";
import type { ToolContext } from "../tools/types.js";

const call = { id: "private-swarm", name: "swarm", arguments: {} };
const deps = { registry: { get: () => undefined } } as unknown as AgentDeps;

function context(signal: AbortSignal, requestApproval: ToolContext["requestApproval"]): ToolContext {
  return { root: "/private/vanta-no-files-fixture", safety: {} as ToolContext["safety"], signal,
    permissionMode: () => "default", requestApproval };
}

function pendingPrompt() {
  let ready!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  let observed: AbortSignal | null | undefined;
  const prompt = vi.fn<ToolContext["requestApproval"]>(async (_action, _reason, _name, detail) => {
    observed = detail?.signal; ready();
    return new Promise<boolean>(resolve => {
      if (observed?.aborted) resolve(false);
      else observed?.addEventListener("abort", () => resolve(false), { once: true });
    });
  });
  return { prompt, started, signal: () => observed };
}

it.each(["child", "parent"] as const)("nested approval settles when its %s lifetime ends", async stopped => {
  const parent = new AbortController(), child = new AbortController(), p = pendingPrompt();
  const outer = executionContext(call, deps, context(parent.signal, p.prompt));
  const inner = executionContext({ ...call, name: "write_file" }, deps, context(child.signal, outer.requestApproval));
  const result = inner.requestApproval("Write private fixture", "private", "write_file").catch(error => error);
  try {
    await p.started;
    (stopped === "child" ? child : parent).abort();
    await vi.waitFor(() => expect(p.signal()?.aborted).toBe(true));
  } finally { parent.abort(); child.abort(); await result; }
  expect(await result).toMatchObject({ name: "AbortError" });
});

it("a pre-aborted child cannot reach an outer prompt", async () => {
  const parent = new AbortController(), child = new AbortController(); child.abort();
  const prompt = vi.fn<ToolContext["requestApproval"]>(async () => true);
  const outer = executionContext(call, deps, context(parent.signal, prompt));
  await expect(outer.requestApproval("Private action", "private", "write_file", { signal: child.signal }))
    .rejects.toMatchObject({ name: "AbortError" });
  expect(prompt).not.toHaveBeenCalled();
});

it("a null child signal cannot remove the foreground parent lifetime", async () => {
  const parent = new AbortController(), p = pendingPrompt();
  const outer = executionContext(call, deps, context(parent.signal, p.prompt));
  const result = outer.requestApproval("Private action", "private", "write_file", { signal: null }).catch(error => error);
  await p.started; parent.abort();
  expect(await result).toMatchObject({ name: "AbortError" });
});

it("explicit detached delegation remains independent of its originating turn", async () => {
  const parent = new AbortController(); parent.abort();
  const prompt = vi.fn<ToolContext["requestApproval"]>(async () => true);
  const detached = executionContext({ ...call, name: "delegate", arguments: { background: true } }, deps, context(parent.signal, prompt));
  expect(await detached.requestApproval("Private background action", "private", "write_file")).toBe(true);
  expect(prompt.mock.calls[0]?.[3]).toMatchObject({ signal: null });
});
