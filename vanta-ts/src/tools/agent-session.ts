import { z } from "zod";
import { join } from "node:path";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { tmuxSessionBackend } from "../agents/tmux-session-backend.js";
import {
  openSession,
  sendToSession,
  readSession,
  closeSession,
  listSessions,
  knownInteractiveAgents,
} from "../agents/agent-session.js";

// VANTA-AGENT-SESSION-INTERACTIVE — the `agent_session` tool: open a persistent
// interactive session over another agent CLI and drive it turn-by-turn. Each
// state-changing action (open/send/close) is approval-gated AND kernel-gated via
// describeForSafety; read/list are read-only.

const Args = z.object({
  action: z.enum(["open", "send", "read", "close", "list"]),
  agent: z.string().optional(),
  id: z.string().optional(),
  text: z.string().optional(),
  show: z.boolean().optional(), // open: pop a visible terminal window to watch (default true)
  coding: z.boolean().optional(), // open: launch the agent build-ready (auto-accepts file edits)
});

const backend = tmuxSessionBackend;

function dataDir(root: string): string {
  return join(root, ".vanta");
}

function missing(action: string, need: string): ToolResult {
  return { ok: false, output: `agent_session ${action} needs {${need}}` };
}

function str(v: unknown): string {
  return String(v ?? "");
}

/** The kernel-facing risk description for a given action (kept out of the tool literal to bound complexity). */
function describeAction(a: Record<string, unknown>): string {
  const action = str(a.action);
  if (action === "open") return `open interactive agent session: ${str(a.agent)}`;
  if (action === "send") return `send to agent session ${str(a.id)}: ${str(a.text).slice(0, 120)}`;
  if (action === "close") return `close agent session ${str(a.id)}`;
  if (action === "read") return `read agent session ${str(a.id)}`;
  return "list agent sessions";
}

async function doOpen(o: { ctx: ToolContext; dir: string; agent?: string; show?: boolean; coding?: boolean }): Promise<ToolResult> {
  const { ctx, dir, agent, show, coding } = o;
  if (!agent) return missing("open", "agent");
  const visible = show ?? process.env.VANTA_AGENT_SHOW !== "0"; // default: pop a window to watch
  const mode = coding ? " in BUILD mode (auto-accepts file edits)" : "";
  const detail = coding
    ? "spawns the agent build-ready — it auto-accepts file edits and can change files in this project on its own"
    : "spawns a persistent external agent CLI you can drive turn-by-turn";
  const approved = await ctx.requestApproval(`open interactive ${agent} session${mode}${visible ? " (opens a terminal window)" : ""}`, detail, "agent_session");
  if (!approved) return { ok: false, output: "agent_session: declined" };
  const r = await openSession({ backend, dataDir: dir, agent, show: visible, coding });
  if ("error" in r) return { ok: false, output: r.error };
  const watch = visible ? `\nA terminal window opened so you can watch it work (or run: tmux attach -t ${r.backendName}).` : "";
  const build = coding ? "\nBUILD mode: it auto-accepts file edits (approve any bash prompt in the window)." : "";
  return { ok: true, output: `opened ${agent} session: ${r.id}${build}${watch}\nsend with agent_session(action:"send", id:"${r.id}", text:"…"); close with agent_session(action:"close", id:"${r.id}")` };
}

async function doSend(ctx: ToolContext, dir: string, id?: string, text?: string): Promise<ToolResult> {
  if (!id || text === undefined) return missing("send", "id, text");
  const approved = await ctx.requestApproval(`send to agent session ${id}: ${text.slice(0, 80)}`, "drives the external agent session (it runs in its own harness + approval mode)", "agent_session");
  if (!approved) return { ok: false, output: "agent_session: declined" };
  const onProgress = ctx.onProgress ? (s: string) => ctx.onProgress?.(`⋯ ${id}: ${s}`) : undefined; // stream live progress
  const r = await sendToSession({ backend, dataDir: dir, id, text, onProgress });
  if ("error" in r) return { ok: false, output: r.error };
  const note = r.settled ? "" : `\n(still working — watch the window, or agent_session(action:"read", id:"${id}") for an update)`;
  return { ok: true, output: `[${id}]\n${r.reply || "(no output captured — try agent_session read)"}${note}` };
}

function doRead(dir: string, id?: string): ToolResult {
  if (!id) return missing("read", "id");
  const r = readSession({ backend, dataDir: dir, id });
  if ("error" in r) return { ok: false, output: r.error };
  return { ok: true, output: `[${id}]\n${r.text || "(no output yet)"}` };
}

async function doClose(ctx: ToolContext, dir: string, id?: string): Promise<ToolResult> {
  if (!id) return missing("close", "id");
  const approved = await ctx.requestApproval(`close agent session ${id}`, "kills the external agent session", "agent_session");
  if (!approved) return { ok: false, output: "agent_session: declined" };
  const r = closeSession({ backend, dataDir: dir, id });
  return "error" in r ? { ok: false, output: r.error } : { ok: true, output: `closed ${id}` };
}

function doList(dir: string): ToolResult {
  const sessions = listSessions(dir);
  if (!sessions.length) return { ok: true, output: `(no open agent sessions). Open one: agent_session(action:"open", agent:"claude"). Agents: ${knownInteractiveAgents().join(", ")}` };
  return { ok: true, output: sessions.map((s) => `${s.id}  ${s.agent}  (opened ${s.createdAt})`).join("\n") };
}

export const agentSessionTool: Tool = {
  schema: {
    name: "agent_session",
    description:
      "Open a PERSISTENT interactive session over another agent CLI (claude/codex/gemini/cursor-agent/opencode) and drive it turn-by-turn — unlike call_agent (one-shot, headless), this keeps its conversation context AND opens a VISIBLE terminal window the user can watch the agent work in. Use this (not call_agent) when the user says open/start/watch a session or wants to see it. Pass coding:true to launch it BUILD-READY (auto-accepts file edits so it can actually write/change code hands-free) — use that when the user wants the agent to build/implement/fix code, not just chat. Actions: open {agent, coding?} → id (pops a window; pass show:false for headless); send {id, text} (returns the agent's reply); read {id} (re-read the pane); close {id}; list. Backed by a tmux session.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["open", "send", "read", "close", "list"], description: "What to do" },
        agent: { type: "string", description: "For open: which agent CLI (claude/codex/gemini/cursor-agent/opencode)" },
        id: { type: "string", description: "For send/read/close: the session id from open" },
        text: { type: "string", description: "For send: the prompt to send to the agent" },
        show: { type: "boolean", description: "For open: open a visible terminal window to watch (default true; false = headless)" },
        coding: { type: "boolean", description: "For open: launch build-ready (auto-accepts file edits so the agent can write/change code hands-free). Default false." },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => describeAction(a as Record<string, unknown>),
  async execute(raw, ctx: ToolContext): Promise<ToolResult> {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "agent_session needs {action: open|send|read|close|list, ...}" };
    const { action, agent, id, text, show, coding } = parsed.data;
    const dir = dataDir(ctx.root);
    switch (action) {
      case "list":
        return doList(dir);
      case "open":
        return doOpen({ ctx, dir, agent, show, coding });
      case "send":
        return doSend(ctx, dir, id, text);
      case "read":
        return doRead(dir, id);
      case "close":
        return doClose(ctx, dir, id);
    }
  },
};
