import type { EffectGateContext } from "../effects/execute-effect.js";
import { resolvePermissionMode } from "../modes/permission-mode.js";
import { loadRules } from "../permissions/store.js";
import { createLaunchGate, type ApprovalAsk, type LaunchGate } from "../worker-runtimes/launch-gate.js";
import { requestWebApproval } from "./approval.js";
import type { KernelClient } from "../kernel/client.js";
import { bootstrapKernel } from "../session/bootstrap-kernel.js";
import type { DesktopState } from "./handler-state.js";
import { pushTypedEvent } from "./typed-emit.js";
import { approvalResolvedEvent } from "./typed-events.js";

// The launch gate for external worker CLIs in the desktop: the session's kernel
// client plus the web approval flow (the same card and the same project-scoped
// "Always" rules as every tool).

const APPROVAL_POLL_MS = 250;
const APPROVAL_SLOT_WAIT_MS = 10 * 60_000;


const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const queues = new WeakMap<DesktopState, Promise<unknown>>();

/** One card at a time per session: callers wait their turn instead of reading a busy slot as a refusal. */
function serialized<T>(state: DesktopState, task: () => Promise<T>): Promise<T> {
  const next = (queues.get(state) ?? Promise.resolve()).then(task, task);
  queues.set(state, next.catch(() => undefined));
  return next;
}

async function waitForApprovalSlot(state: DesktopState, signal?: AbortSignal): Promise<boolean> {
  const deadline = Date.now() + APPROVAL_SLOT_WAIT_MS;
  while (state.pendingApproval && Date.now() < deadline && !signal?.aborted) await sleep(APPROVAL_POLL_MS);
  return !state.pendingApproval && !signal?.aborted;
}

/** Withdraw our card when the worker is paused while it is still open, so no dead card stays on screen. */
function withdrawOnAbort(state: DesktopState, signal: AbortSignal): Promise<false> {
  const card = state.pendingApproval;
  return new Promise((resolve) => signal.addEventListener("abort", () => {
    if (card && state.pendingApproval === card) {
      state.pendingApproval = undefined;
      pushTypedEvent(state, approvalResolvedEvent(card.id));
    }
    resolve(false);
  }, { once: true }));
}

async function ask(state: DesktopState, request: ApprovalAsk, signal?: AbortSignal): Promise<boolean> {
  return serialized(state, async () => {
    if (!(await waitForApprovalSlot(state, signal))) return false;
    const answer = requestWebApproval(state, request.action, request.reason, { toolName: request.toolName, detail: request.detail });
    return signal ? Promise.race([answer, withdrawOnAbort(state, signal)]) : answer;
  });
}

const kernels = new WeakMap<DesktopState, Promise<KernelClient>>();

/** The live session's kernel client, or the project's kernel started on its own: an external CLI worker must not need a model provider just to be gated. */
function kernelFor(state: DesktopState): Promise<KernelClient> {
  if (state.setup) return Promise.resolve(state.setup.safety);
  let pending = kernels.get(state);
  if (!pending) {
    pending = bootstrapKernel(state.root);
    pending.catch(() => kernels.delete(state));
    kernels.set(state, pending);
  }
  return pending;
}

/** Test seam: a stand-in kernel so a gate test needs no kernel process. */
export type GateSeams = { kernel?: EffectGateContext["kernel"] };

export function createDesktopLaunchGate(state: DesktopState, seams: GateSeams = {}): LaunchGate {
  return {
    authorize: async (request) => {
      const env = state._env ?? process.env;
      const kernel = seams.kernel ?? await kernelFor(state);
      const effectGate: EffectGateContext = {
        kernel,
        approval: { request: (r) => ask(state, { action: r.action, reason: r.reason, toolName: "effect_gate", detail: { fresh: true } }, request.signal) },
        projectRoot: state.root,
        sessionId: state.sessionId,
        operationId: `worker-run:${request.runId}`,
        scopeId: `worker-runtime:${request.ticketId}`,
        permissionMode: resolvePermissionMode(env),
      };
      return createLaunchGate({
        assess: (action) => kernel.assess(action),
        loadRules: () => loadRules(env),
        requestApproval: ask.bind(null, state),
        effectGate,
        projectRoot: state.root,
      }).authorize(request);
    },
  };
}
