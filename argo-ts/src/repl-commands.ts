import { listSkills } from "./skills/store.js";
import { gatherStatus, formatStatus } from "./status.js";
import { listSessions, loadSession, newSessionId } from "./sessions/store.js";
import { loadCron } from "./schedule/cron.js";
import type { Conversation } from "./agent.js";
import type { RunSetup } from "./session.js";

// Slash commands for the interactive surface — the Hermes/OpenClaw `/` set,
// scoped to what Argo actually has. The core is `executeSlash`, which RETURNS
// its output as a string (no console side effects) so both the readline REPL
// and the Ink TUI can drive it. `runSlashCommand` is the readline wrapper that
// prints the result. Each command reuses an existing subsystem (status,
// sessions, cron, skills); none duplicates logic.

/** Mutable per-session REPL state that some commands change (/clear, /resume). */
export type ReplState = { sessionId: string; started: string; turnIndex: number };

export type ReplCtx = {
  convo: Conversation;
  setup: RunSetup;
  dataDir: string;
  state: ReplState;
  env: NodeJS.ProcessEnv;
  now: () => Date;
};

/** Outcome of a slash command: text to show plus control signals for the host. */
export type SlashResult = {
  output?: string;
  exit?: boolean;
  cleared?: boolean;
  resumed?: boolean;
  unknown?: boolean;
};

/** Canonical command catalog — drives `/help`, the TUI palette, and validation. */
export const SLASH_COMMANDS: ReadonlyArray<{ name: string; arg?: string; desc: string }> = [
  { name: "help", desc: "show this command list" },
  { name: "clear", desc: "start a fresh conversation (keeps the session log)" },
  { name: "model", desc: "show the active model + context window" },
  { name: "tools", desc: "list available tools" },
  { name: "skills", desc: "list learned + installed skills" },
  { name: "status", desc: "kernel, provider, keys, store health" },
  { name: "goals", desc: "active goals from the kernel" },
  { name: "sessions", desc: "list saved sessions" },
  { name: "resume", arg: "<id>", desc: "load a past session into this conversation" },
  { name: "cron", desc: "list scheduled tasks" },
  { name: "exit", desc: "leave the session" },
];

export const SLASH_HELP = [
  "  Commands:",
  ...SLASH_COMMANDS.map((c) => `    /${c.name}${c.arg ? ` ${c.arg}` : ""}`.padEnd(24) + c.desc),
  "  Anything else is sent to the agent (history persists across the session).",
].join("\n");

function lines(items: string[], empty: string): string {
  return items.length ? items.join("\n") : empty;
}

/**
 * Run a `/command`, returning its output and control signals. Pure of console
 * side effects; it may mutate `ctx.convo` / `ctx.state` (that IS the command's
 * job for /clear and /resume). Unknown commands are reported, not sent to the
 * model.
 */
export async function executeSlash(input: string, ctx: ReplCtx): Promise<SlashResult> {
  const [cmd, ...rest] = input.slice(1).split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "help":
      return { output: SLASH_HELP };

    case "exit":
    case "quit":
      return { exit: true };

    case "clear":
    case "new":
      ctx.convo.messages.splice(1); // keep the system message, drop history
      ctx.state.sessionId = newSessionId(ctx.now());
      ctx.state.started = ctx.now().toISOString();
      ctx.state.turnIndex = 0;
      return { output: "  · started a fresh conversation", cleared: true };

    case "skills": {
      const s = await listSkills(ctx.env);
      return {
        output: lines(
          s.map((x) => `  ${x.meta.name} — ${x.meta.description}`),
          "  (no skills yet — `argo skills install`)",
        ),
      };
    }

    case "tools":
      return { output: `  ${ctx.setup.registry.schemas().map((s) => s.name).join(", ")}` };

    case "model":
      return { output: `  ${ctx.setup.provider.modelId()} · ${ctx.setup.provider.contextWindow().toLocaleString()} ctx` };

    case "status":
    case "doctor":
      return { output: formatStatus(await gatherStatus(ctx.env)) };

    case "goals": {
      const goals = await ctx.setup.safety.getGoals().catch(() => []);
      const active = goals.filter((g) => g.status === "active");
      return { output: lines(active.map((g) => `  [${g.id}] ${g.text}`), "  (no active goals)") };
    }

    case "sessions": {
      const ss = await listSessions(ctx.env);
      return { output: lines(ss.map((s) => `  ${s.id}  ${s.turns} turn(s)  ${s.title}`), "  (no saved sessions)") };
    }

    case "resume": {
      if (!arg) return { output: "  usage: /resume <id>  (see /sessions)" };
      const s = await loadSession(arg, ctx.env);
      if (!s) return { output: `  no session "${arg}"` };
      ctx.convo.messages.splice(1, Infinity, ...s.messages.filter((m) => m.role !== "system"));
      ctx.state.sessionId = s.id;
      ctx.state.started = s.started;
      ctx.state.turnIndex = s.messages.filter((m) => m.role === "user").length;
      return { output: `  ↻ resumed ${s.id} "${s.title}" (${ctx.state.turnIndex} turn(s))`, resumed: true };
    }

    case "cron": {
      const entries = await loadCron(ctx.dataDir);
      return {
        output: lines(
          entries.map((e) => `  #${e.id} [${e.status}] ${e.cron} — ${e.instruction}`),
          "  (no scheduled tasks)",
        ),
      };
    }

    default:
      return { output: `  unknown command /${cmd} — /help for the list`, unknown: true };
  }
}

/**
 * Readline wrapper around `executeSlash`: prints the output and returns whether
 * the REPL should exit. The TUI calls `executeSlash` directly instead.
 */
export async function runSlashCommand(input: string, ctx: ReplCtx): Promise<boolean> {
  const result = await executeSlash(input, ctx);
  if (result.output) console.log(result.output);
  return result.exit ?? false;
}
