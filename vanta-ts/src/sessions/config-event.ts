import { createHash } from "node:crypto";

// Per-session config snapshot logged to events.jsonl at startup. A past failing
// input can then be re-run under the SAME resolved setup (provider, model, tool
// set, system-prompt hash) — the reproducibility foundation the self-correcting
// harness needs (SELFHARNESS-CONFIG-REPRO). Pure: build the snapshot + its event
// string; the caller logs it best-effort.

export type SessionConfig = {
  provider: string;
  model: string;
  contextWindow: number;
  tools: number;
  promptChars: number;
  /** First 12 hex of sha256(systemPrompt) — identifies the exact prompt build. */
  promptHash: string;
};

export function sessionConfig(opts: {
  provider: string;
  model: string;
  contextWindow: number;
  tools: number;
  systemPrompt: string;
}): SessionConfig {
  return {
    provider: opts.provider,
    model: opts.model,
    contextWindow: opts.contextWindow,
    tools: opts.tools,
    promptChars: opts.systemPrompt.length,
    promptHash: createHash("sha256").update(opts.systemPrompt).digest("hex").slice(0, 12),
  };
}

/** Serialize the snapshot as a `session_config` event line for the kernel log. */
export function sessionConfigEvent(cfg: SessionConfig, now: string): string {
  return JSON.stringify({ kind: "session_config", ts: now, ...cfg });
}
