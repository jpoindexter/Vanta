// VANTA-AGENT-SESSION-INTERACTIVE — a persistent, drivable session over ANOTHER
// agent CLI (claude/codex/gemini/cursor-agent/opencode). call_agent is one-shot;
// this is "start one up and keep talking to it": open → send → read → close,
// turn-by-turn, with the agent's conversation context carried by its own process.
//
// The substrate is a detached tmux session (node-pty's native binding doesn't load
// on node v24, so tmux is the proven path — same choice as fleet/tmux-backend.ts
// and terminal_capture). The backend is an injected PORT so the orchestration is
// fully unit-tested with a fake; production uses the real tmux backend.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { processCapture } from "../term/terminal-capture.js";
import { openVisibleTerminal } from "./visible-terminal.js";
import { waitForReply, DEFAULT_MAX_LINES } from "./reply-wait.js";

// `tailOf` lives in ./reply-wait.js — re-exported so importers/tests keep the path.
export { tailOf } from "./reply-wait.js";

/** Injectable terminal-session backend (tmux in production, a fake in tests). */
export interface SessionBackend {
  /** Whether the backend (tmux) is usable on this machine. */
  available(): boolean;
  /** Start `command` detached under a backend session named `name`. */
  start(name: string, command: string): void;
  /** Type `text` then Enter into the session. */
  sendText(name: string, text: string): void;
  /** Send a single named key (e.g. "Escape", "Enter") — used to clear startup modals. */
  sendKey(name: string, key: string): void;
  /** Capture the current pane content (raw bytes, ANSI intact). */
  capture(name: string): string;
  /** Kill the session (idempotent — a missing session is not an error). */
  kill(name: string): void;
  /** Whether a session named `name` is currently live. */
  has(name: string): boolean;
}

/** Interactive launch command per known agent (the agent's own REPL/TUI). */
const LAUNCH: Record<string, string> = {
  claude: "claude",
  codex: "codex",
  gemini: "gemini",
  "cursor-agent": "cursor-agent",
  opencode: "opencode",
};

// Build-ready launch: the agent auto-accepts file EDITS so it can actually code hands-free
// (it still prompts for riskier tools like bash — approve those in the visible window).
// claude's flag is verified against the CLI; agents without an entry fall back to plain
// interactive launch when `coding` is set (the edit-mode flag is per-agent, add as verified).
const CODING_LAUNCH: Record<string, string> = {
  claude: "claude --permission-mode acceptEdits",
};

/** Resolve the launch command for an agent — build-ready when `coding`, else interactive. */
function launchFor(agent: string, coding?: boolean): string | undefined {
  return coding ? (CODING_LAUNCH[agent] ?? LAUNCH[agent]) : LAUNCH[agent];
}

/** The agents this tool can open an interactive session for. */
export function knownInteractiveAgents(): string[] {
  return Object.keys(LAUNCH).sort();
}

export type AgentSession = { id: string; agent: string; backendName: string; createdAt: string };

const REGISTRY = "agent-sessions.json";
// Prime: agent TUIs (claude's MCP picker / trust prompt) show a startup modal
// that swallows the first keystrokes. Wait for boot, then Escape to clear it, so
// the first real prompt lands in the chat input — found live (2026-06-25).
const STARTUP_MS = 8000;
const PRIME_SETTLE_MS = 2500;

function registryPath(dataDir: string): string {
  return join(dataDir, REGISTRY);
}

/** Read the on-disk session registry (tmux sessions outlive the agent process). */
export function listSessions(dataDir: string): AgentSession[] {
  try {
    const raw: unknown = JSON.parse(readFileSync(registryPath(dataDir), "utf8"));
    return Array.isArray(raw) ? (raw as AgentSession[]) : [];
  } catch {
    return [];
  }
}

function saveSessions(dataDir: string, sessions: AgentSession[]): void {
  const p = registryPath(dataDir);
  if (!existsSync(dirname(p))) mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(sessions, null, 2));
}

function find(dataDir: string, id: string): AgentSession | undefined {
  return listSessions(dataDir).find((s) => s.id === id);
}

function genId(): string {
  return `ag-${Math.random().toString(36).slice(2, 8)}`;
}

/** Boot-wait then Escape, to clear an agent's startup modal before the first prompt. */
async function primeSession(o: {
  backend: SessionBackend;
  name: string;
  startupMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  await sleep(o.startupMs ?? STARTUP_MS); // let the TUI finish booting
  o.backend.sendKey(o.name, "Escape"); // dismiss any startup modal (MCP picker / trust)
  await sleep(PRIME_SETTLE_MS);
}

/** Open a fresh interactive session for `agent` and prime it ready. Errors as values.
 * `show:true` also opens a VISIBLE terminal window attached to the session (best-effort,
 * via an injectable `openTerminal`) so the operator can watch the agent work. */
export async function openSession(o: {
  backend: SessionBackend;
  dataDir: string;
  agent: string;
  idGen?: () => string;
  startupMs?: number;
  sleep?: (ms: number) => Promise<void>;
  show?: boolean;
  coding?: boolean;
  openTerminal?: (tmuxName: string) => { ok: true } | { error: string };
}): Promise<AgentSession | { error: string }> {
  const launch = launchFor(o.agent, o.coding);
  if (!launch) return { error: `unknown agent "${o.agent}". Known: ${knownInteractiveAgents().join(", ")}` };
  if (!o.backend.available()) return { error: "tmux is not available — the interactive session backend needs tmux on PATH" };
  const id = (o.idGen ?? genId)();
  const backendName = `vanta-${id}`;
  o.backend.start(backendName, launch);
  await primeSession({ backend: o.backend, name: backendName, startupMs: o.startupMs, sleep: o.sleep });
  if (o.show) (o.openTerminal ?? openVisibleTerminal)(backendName); // pop a window to watch — best-effort
  const session: AgentSession = { id, agent: o.agent, backendName, createdAt: new Date().toISOString() };
  saveSessions(o.dataDir, [...listSessions(o.dataDir), session]);
  return session;
}

/** Send `text` to the session, stream progress, return the pane + whether it settled.
 * `settled:false` means the agent was still working when the wait capped (long task). */
export async function sendToSession(o: {
  backend: SessionBackend;
  dataDir: string;
  id: string;
  text: string;
  wait?: { settleMs?: number; maxMs?: number; sleep?: (ms: number) => Promise<void> };
  onProgress?: (snapshot: string) => void;
}): Promise<{ reply: string; settled: boolean } | { error: string }> {
  const session = find(o.dataDir, o.id);
  if (!session) return { error: `no agent session "${o.id}" — open one first (agent_session open)` };
  if (!o.backend.has(session.backendName)) return { error: `agent session "${o.id}" is no longer running` };
  o.backend.sendText(session.backendName, o.text);
  const r = await waitForReply({ backend: o.backend, name: session.backendName, onProgress: o.onProgress, ...o.wait });
  return { reply: r.text, settled: r.settled };
}

/** Read the session's current pane without sending anything. */
export function readSession(o: {
  backend: SessionBackend;
  dataDir: string;
  id: string;
  maxLines?: number;
}): { text: string } | { error: string } {
  const session = find(o.dataDir, o.id);
  if (!session) return { error: `no agent session "${o.id}"` };
  if (!o.backend.has(session.backendName)) return { error: `agent session "${o.id}" is no longer running` };
  return { text: processCapture(o.backend.capture(session.backendName), { maxLines: o.maxLines ?? DEFAULT_MAX_LINES }) };
}

/** Kill the session and drop it from the registry. */
export function closeSession(o: { backend: SessionBackend; dataDir: string; id: string }): { ok: true } | { error: string } {
  const session = find(o.dataDir, o.id);
  if (!session) return { error: `no agent session "${o.id}"` };
  o.backend.kill(session.backendName);
  saveSessions(o.dataDir, listSessions(o.dataDir).filter((s) => s.id !== o.id));
  return { ok: true };
}
