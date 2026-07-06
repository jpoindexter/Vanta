import { createAdapter } from "../gateway/platforms/factory.js";
import type { PlatformAdapter } from "../gateway/platforms/base.js";
import { getBudget } from "../budget/store.js";
import { isExceeded } from "../budget/types.js";
import { resolveOutreachConfig, decideOutreach, recordOutreach, parseOutreachTarget } from "./outreach.js";
import { loadOutreachState, saveOutreachState } from "./outreach-store.js";

// The outreach orchestrator: resolve config → decide under the throttle → build
// the platform adapter → connect/send/disconnect → record the send. Adapter and
// budget verdict are injected so tests run without a live channel or a kernel.

/** Injected seams (defaults are the live adapter factory + budget store). */
export type OutreachDeps = {
  buildAdapter: (platform: string, env: NodeJS.ProcessEnv) => PlatformAdapter | { ok: false; error: string };
  budgetExceeded: (dataDir: string, scope: string) => Promise<boolean>;
};

const liveDeps: OutreachDeps = {
  buildAdapter: createAdapter,
  budgetExceeded: async (dataDir, scope) => {
    const b = await getBudget(dataDir, scope);
    return b ? isExceeded(b) : false;
  },
};

export type OutreachSendArgs = {
  dataDir: string;
  env: NodeJS.ProcessEnv;
  now: Date;
  /** The unprompted message body. */
  text: string;
  deps?: OutreachDeps;
};

export type OutreachSendResult = { sent: boolean; reason: string };

/**
 * Send one unprompted message to the configured channel, iff the outreach
 * throttle allows it. Errors as values — a failed send never throws, it
 * reports why (and does NOT count against the throttle).
 */
export async function sendOutreach(args: OutreachSendArgs): Promise<OutreachSendResult> {
  const deps = args.deps ?? liveDeps;
  const config = resolveOutreachConfig(args.env);
  const state = await loadOutreachState(args.dataDir);
  const decision = decideOutreach({
    config,
    state,
    now: args.now,
    budgetExceeded: await deps.budgetExceeded(args.dataDir, config.budgetScope),
  });
  if (!decision.send) return { sent: false, reason: decision.reason };

  const target = parseOutreachTarget(config.to);
  if ("error" in target) return { sent: false, reason: target.error };
  const adapter = deps.buildAdapter(target.platform, args.env);
  if ("ok" in adapter) return { sent: false, reason: adapter.error };

  try {
    await adapter.connect();
    await adapter.send({ chatId: target.chatId, text: args.text });
  } catch (err) {
    return { sent: false, reason: `send failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    await adapter.disconnect().catch(() => {});
  }
  await saveOutreachState(args.dataDir, recordOutreach(state, args.now));
  return { sent: true, reason: "ok" };
}
