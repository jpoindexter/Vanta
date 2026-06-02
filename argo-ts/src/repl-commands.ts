import { listSkills } from "./skills/store.js";
import { gatherStatus, formatStatus } from "./status.js";
import { listSessions, loadSession, newSessionId } from "./sessions/store.js";
import { loadCron } from "./schedule/cron.js";
import type { Conversation } from "./agent.js";
import type { RunSetup } from "./session.js";

// Slash commands for the interactive REPL — the Hermes/OpenClaw `/` surface,
// scoped to what Argo actually has. Kept out of interactive.ts so the REPL loop
// stays small. Each command reuses an existing subsystem (status, sessions,
// cron, skills); none duplicates logic.

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

export const SLASH_HELP = [
  "  Commands:",
  "    /help                show this",
  "    /exit /quit          leave the session",
  "    /clear /new          start a fresh conversation (keeps the session log)",
  "    /skills              list learned + installed skills",
  "    /tools               list available tools",
  "    /model               show the active model + context window",
  "    /status /doctor      kernel, provider, keys, store health",
  "    /goals               active goals from the kernel",
  "    /sessions            list saved sessions",
  "    /resume <id>         load a past session into this conversation",
  "    /cron                list scheduled tasks",
  "  Anything else is sent to the agent (history persists across the session).",
].join("\n");

function lines(items: string[], empty: string): string {
  return items.length ? items.join("\n") : empty;
}

/**
 * Handle a `/command`. Returns true if the REPL should exit. Unknown commands
 * are reported, not sent to the model.
 */
export async function runSlashCommand(input: string, ctx: ReplCtx): Promise<boolean> {
  const [cmd, ...rest] = input.slice(1).split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "help":
      console.log(SLASH_HELP);
      return false;

    case "exit":
    case "quit":
      return true;

    case "clear":
    case "new":
      ctx.convo.messages.splice(1); // keep the system message, drop history
      ctx.state.sessionId = newSessionId(ctx.now());
      ctx.state.started = ctx.now().toISOString();
      ctx.state.turnIndex = 0;
      console.log("  · started a fresh conversation");
      return false;

    case "skills": {
      const s = await listSkills(ctx.env);
      console.log(lines(s.map((x) => `  ${x.meta.name} — ${x.meta.description}`), "  (no skills yet — `argo skills install`)"));
      return false;
    }

    case "tools":
      console.log(`  ${ctx.setup.registry.schemas().map((s) => s.name).join(", ")}`);
      return false;

    case "model":
      console.log(`  ${ctx.setup.provider.modelId()} · ${ctx.setup.provider.contextWindow().toLocaleString()} ctx`);
      return false;

    case "status":
    case "doctor":
      console.log(formatStatus(await gatherStatus(ctx.env)));
      return false;

    case "goals": {
      const goals = await ctx.setup.safety.getGoals().catch(() => []);
      const active = goals.filter((g) => g.status === "active");
      console.log(lines(active.map((g) => `  [${g.id}] ${g.text}`), "  (no active goals)"));
      return false;
    }

    case "sessions": {
      const ss = await listSessions(ctx.env);
      console.log(lines(ss.map((s) => `  ${s.id}  ${s.turns} turn(s)  ${s.title}`), "  (no saved sessions)"));
      return false;
    }

    case "resume": {
      if (!arg) {
        console.log("  usage: /resume <id>  (see /sessions)");
        return false;
      }
      const s = await loadSession(arg, ctx.env);
      if (!s) {
        console.log(`  no session "${arg}"`);
        return false;
      }
      ctx.convo.messages.splice(1, Infinity, ...s.messages.filter((m) => m.role !== "system"));
      ctx.state.sessionId = s.id;
      ctx.state.started = s.started;
      ctx.state.turnIndex = s.messages.filter((m) => m.role === "user").length;
      console.log(`  ↻ resumed ${s.id} "${s.title}" (${ctx.state.turnIndex} turn(s))`);
      return false;
    }

    case "cron": {
      const entries = await loadCron(ctx.dataDir);
      console.log(lines(entries.map((e) => `  #${e.id} [${e.status}] ${e.cron} — ${e.instruction}`), "  (no scheduled tasks)"));
      return false;
    }

    default:
      console.log(`  unknown command /${cmd} — /help for the list`);
      return false;
  }
}
