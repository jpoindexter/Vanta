import { listSkills } from "../skills/store.js";
import { gatherStatus, formatStatus } from "../status.js";
import { newSessionId } from "../sessions/store.js";
import { slashHelp } from "./catalog.js";
import { oneLine, lastUserIndex } from "./format.js";
import type { ReplCtx, SlashResult, SlashHandler } from "./types.js";
import { next } from "./next.js";
import { goal } from "./goal-cmd.js";
import { planMode } from "./plan-mode.js";
import { auto } from "./auto-cmd.js";
import { boundary } from "./boundary.js";
import { where } from "./where.js";
import { wm } from "./wm.js";
import { model } from "./model-cmd.js";
import { effort } from "./effort-cmd.js";
import { moim } from "./moim-cmd.js";
import { restart } from "./restart-cmd.js";
import { bug } from "./bug-cmd.js";
import { handoff } from "./handoff-cmd.js";
import { open } from "./open-cmd.js";
import { edit } from "./edit-cmd.js";
import { tasks } from "./tasks-cmd.js";
import { btw } from "./btw-cmd.js";
import { diff } from "./diff-cmd.js";
import { search } from "./search-cmd.js";
import { dashboard } from "./dashboard-cmd.js";
import { repro } from "./repro-cmd.js";
import { brief } from "./brief-cmd.js";
import { review, simplify, verify, run } from "./coding-skills.js";
import { addDir } from "./add-dir-cmd.js";
import { routes } from "./routes-cmd.js";
import { files } from "./files-cmd.js";
import { theme } from "./theme-cmd.js";
import { composer } from "./composer-cmd.js";
import { rename } from "./rename-cmd.js";
import { branch } from "./branch-cmd.js";
import { summary } from "./summary-cmd.js";
import { rewind } from "./rewind-cmd.js";
import { hooks } from "./hooks-cmd.js";
import { outputStyle } from "./output-style-cmd.js";
import { tuiCommand } from "./tui-cmd.js";
import { focusCommand } from "./focus-cmd.js";
import { permissions } from "./permissions-cmd.js";
import { now } from "./now-cmd.js";
import { contextCmd } from "./context-cmd.js";
import { init } from "./init-cmd.js";
import { CLI_PASSTHROUGH } from "./cli-bridge.js";
import { formatGoalLedger } from "./goal-ledger.js";
import { ultrathink, ultracode, deepResearch, skeptic } from "./think-cmd.js";
import { health, world, money, radar, team, lifesearch, compartments, locks, reach, cookie } from "./operator-cmds.js";
import { sessions, resume, title, fork } from "./session-cmds.js";
import { image, paste, copy, update } from "./media-cmds.js";
import { history, exportConvo, compress, usage, mcp, cron } from "./context-cmds.js";

const help: SlashHandler = (_arg, ctx) => ({ output: slashHelp(ctx.setup.pluginCommands?.list()) });
const exit: SlashHandler = () => ({ exit: true });

const clear: SlashHandler = (_arg, ctx) => {
  ctx.convo.messages.splice(1);
  ctx.state.sessionId = newSessionId(ctx.now());
  ctx.state.started = ctx.now().toISOString();
  ctx.state.turnIndex = 0;
  ctx.state.title = undefined;
  ctx.state.pendingImages = undefined;
  return { output: "  · started a fresh conversation", cleared: true };
};

const attachments: SlashHandler = (arg, ctx) => {
  const n = ctx.state.pendingImages?.length ?? 0;
  if (arg.toLowerCase() === "clear") {
    ctx.state.pendingImages = undefined;
    return { output: `  · cleared ${n} pending attachment(s)` };
  }
  return { output: n ? `  ${n} image(s) attached for your next message — /attachments clear to remove` : "  (no pending attachments)" };
};

const retry: SlashHandler = (_arg, ctx) => {
  const idx = lastUserIndex(ctx.convo.messages);
  if (idx < 0) return { output: "  (nothing to retry)" };
  const last = ctx.convo.messages[idx];
  const text = last && last.role === "user" ? last.content : "";
  ctx.convo.messages.splice(idx);
  ctx.state.turnIndex = Math.max(0, ctx.state.turnIndex - 1);
  return { output: `  ↻ retrying: ${oneLine(text, 60)}`, resend: text };
};

const undo: SlashHandler = (_arg, ctx) => {
  const idx = lastUserIndex(ctx.convo.messages);
  if (idx < 0) return { output: "  (nothing to undo)" };
  ctx.convo.messages.splice(idx);
  ctx.state.turnIndex = Math.max(0, ctx.state.turnIndex - 1);
  return { output: "  ↩ undid the last turn" };
};

const skills: SlashHandler = async (_arg, ctx) => {
  const s = await listSkills(ctx.env);
  if (!s.length) return { output: "  (no skills yet — `vanta skills install`)" };
  const w = Math.min(24, Math.max(...s.map((x) => x.meta.name.length)) + 2);
  const rows = s.map((x) => `  ${x.meta.name.padEnd(w)}${oneLine(x.meta.description, 72)}`);
  return { output: `  ${s.length} skill(s):\n${rows.join("\n")}` };
};

const tools: SlashHandler = (_arg, ctx) => ({ output: `  ${ctx.setup.registry.schemas().map((s) => s.name).join(", ")}` });
const cockpit: SlashHandler = () => ({ output: "  mission-control is a TUI view — run `vanta` (interactive) and type /cockpit, or `vanta serve` for the web cockpit." });
const status: SlashHandler = async (_arg, ctx) => ({ output: formatStatus(await gatherStatus(ctx.env)) });

const plan: SlashHandler = async (_arg, ctx) => {
  const { readTodos, formatTodos } = await import("../todo/store.js");
  return { output: formatTodos(await readTodos(ctx.env)) };
};

const memory: SlashHandler = async (arg, ctx) => {
  if (!arg) return { output: "  usage: /memory <something to remember>" };
  const { resolveBrain } = await import("../brain/index.js");
  await resolveBrain(ctx.env).writeRegion("semantic", `- ${arg}`, { append: true, env: ctx.env });
  return { output: `  ◈ remembered: ${oneLine(arg, 80)}` };
};

const goals: SlashHandler = async (_arg, ctx) => {
  const g = await ctx.setup.safety.getGoals().catch(() => []);
  return { output: formatGoalLedger(g) };
};

/** Command-name → handler. Aliases share a handler (clear/new/reset, exit/quit, status/doctor). */
export const HANDLERS: Record<string, SlashHandler> = {
  help, exit, quit: exit, init, clear, new: clear, reset: clear, attachments, history,
  export: exportConvo, retry, undo, rewind, hooks, skills, tools, model, effort, setup: model, status, doctor: status,
  plan, compress, compact: compress, memory, goals, goal, sessions, resume, title, fork, context: contextCmd,
  mcp, usage, copy, update, image, paste, cron, moim, next, now, planmode: planMode, boundary, where, wm, restart, bug, handoff, open, edit, tasks, btw, diff, search, dashboard, repro, brief, review, simplify, verify, run, auto,
  routes, files, theme, composer, cockpit, rename, branch, summary, "output-style": outputStyle, permissions,
  tui: tuiCommand, focus: focusCommand, preferences: async (arg, ctx) => (await import("./preferences-cmd.js")).preferences(arg, ctx),
  ultrathink, ultracode, "deep-research": deepResearch, skeptic, health, world, money, radar, team, lifesearch, compartments, locks, reach, cookie,
  "add-dir": addDir, ...CLI_PASSTHROUGH,
};

/** Look up + run a parsed command; returns null for an unknown command. */
export async function dispatch(cmd: string, arg: string, ctx: ReplCtx): Promise<SlashResult | null> {
  const handler = HANDLERS[cmd];
  if (handler) return handler(arg, ctx);
  const pluginCommand = ctx.setup.pluginCommands?.get(cmd);
  return pluginCommand ? pluginCommand.handler(arg, ctx) : null;
}
