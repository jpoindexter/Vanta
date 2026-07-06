import { randomUUID } from "node:crypto";
import { relayApproval } from "./channel-relay.js";
import { buildPermissionRequest } from "./request.js";
import type { ReplyBus } from "./reply-bus.js";

// CHANNEL-PERMISSIONS-WIRE — the live requestApproval for gateway runs: an
// ask-tier action relays an approval prompt to the configured approver chat
// and races the channel reply against a local resolver. Headless gateway runs
// have no local UI, so the local side is a bounded timer that DENIES at the
// timeout — the pre-wire behavior (instant deny) becomes "deny after N seconds
// unless an allowlisted human approves from chat". Strictly opt-in: no
// VANTA_APPROVER_CHATS → this module is never built and behavior is unchanged.

const DEFAULT_TIMEOUT_SEC = 120;

/** Chat ids allowed to approve, from VANTA_APPROVER_CHATS (comma list). */
export function resolveApproverChats(env: NodeJS.ProcessEnv): string[] {
  return (env.VANTA_APPROVER_CHATS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Relay window before the headless local side denies (VANTA_CHANNEL_APPROVAL_TIMEOUT_SEC). */
export function approvalTimeoutMs(env: NodeJS.ProcessEnv): number {
  const n = Number(env.VANTA_CHANNEL_APPROVAL_TIMEOUT_SEC);
  return (Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_SEC) * 1000;
}

/** A local resolver that denies at the timeout (cancelled cleanly on abort). */
function timerDeny(timeoutMs: number): (signal: AbortSignal) => Promise<boolean> {
  return (signal) =>
    new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), timeoutMs);
      signal.addEventListener("abort", () => clearTimeout(t), { once: true });
    });
}

export type ApprovalButton = { label: string; data: string };

export type ChannelApproverOpts = {
  /** Deliver the prompt to the approver chat (adapter send, curried on chatId).
   * MSG-INLINE-APPROVAL: `buttons` carry tappable Approve/Deny whose callback
   * data is the same "yes/no <id>" reply text — adapters without buttons ignore
   * them and the text instruction still works. */
  send: (text: string, buttons?: ApprovalButton[]) => Promise<void>;
  bus: ReplyBus;
  /** Chat ids permitted to approve (VANTA_APPROVER_CHATS). */
  allowlist: readonly string[];
  timeoutMs: number;
  /**
   * DEADLOCK BREAKER — the gateway loop is blocked while the turn awaits this
   * approval, so nobody else can poll the platform for the reply. The relay
   * pumps this poll itself while waiting (the loop being blocked also means no
   * concurrent getUpdates); non-approval messages are parked on the bus and
   * drained by the main loop afterwards. Absent → no pump (tests/localResolve).
   */
  poll?: () => Promise<Array<{ chatId: string; text: string }>>;
  pollIntervalMs?: number;
  /** Local resolver override (tests; interactive hosts could pass their prompt). */
  localResolve?: (signal: AbortSignal) => Promise<boolean>;
  log?: (msg: string) => void;
};

/** Pump the platform poll into the bus until aborted (see poll doc above). */
function startPump(opts: ChannelApproverOpts, signal: AbortSignal): void {
  if (!opts.poll) return;
  const interval = setInterval(() => {
    void opts.poll!().then((msgs) => {
      for (const m of msgs) {
        if (!opts.bus.tryConsume(m)) opts.bus.stashBypassed(m);
      }
    }).catch(() => {});
  }, opts.pollIntervalMs ?? 2000);
  signal.addEventListener("abort", () => clearInterval(interval), { once: true });
}

/** Build the requestApproval fn that relays ask-tier actions to the channel. */
export function buildChannelApprover(
  opts: ChannelApproverOpts,
): (action: string, reason: string, toolName?: string) => Promise<boolean> {
  const log = opts.log ?? (() => {});
  return async (action, reason, toolName) => {
    const request = buildPermissionRequest({ action, reason, toolName });
    const requestId = randomUUID().slice(0, 6);
    opts.bus.register(requestId);
    const pumpController = new AbortController();
    startPump(opts, pumpController.signal);
    try {
      const buttons: ApprovalButton[] = [
        { label: "✅ Approve", data: `yes ${requestId}` },
        { label: "❌ Deny", data: `no ${requestId}` },
      ];
      const outcome = await relayApproval({
        request,
        requestId,
        send: (text) => opts.send(text, buttons),
        replies: opts.bus.stream,
        localResolve: opts.localResolve ?? timerDeny(opts.timeoutMs),
        allowlist: opts.allowlist,
      });
      log(`approval [${requestId}] ${outcome.verdict} via ${outcome.via}: ${action.slice(0, 60)}`);
      return outcome.verdict === "allow";
    } finally {
      pumpController.abort();
      opts.bus.unregister(requestId);
    }
  };
}
