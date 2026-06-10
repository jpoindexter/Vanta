import { dirname, basename, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { listSkills } from "../skills/store.js";
import { gatherStatus, formatStatus } from "../status.js";
import { listSessions, loadSession, newSessionId, saveSession } from "../sessions/store.js";
import { loadCron } from "../schedule/cron.js";
import { SLASH_HELP } from "./catalog.js";
import { oneLine, lastUserIndex, formatExport, formatHistory, mimeFromPath, lines } from "./format.js";
import { formatSessionCost } from "../pricing.js";
import type { ReplCtx, SlashResult, SlashHandler } from "./types.js";
import { next } from "./next.js";
import { goal } from "./goal-cmd.js";
import { planMode } from "./plan-mode.js";
import { boundary } from "./boundary.js";
import { where } from "./where.js";
import { wm } from "./wm.js";
import { model } from "./model-cmd.js";
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
import { sessionsSearch } from "./sessions-search-cmd.js";
import { repro } from "./repro-cmd.js";
import { brief } from "./brief-cmd.js";
import { review, simplify, verify, run } from "./coding-skills.js";
import { addDir } from "./add-dir-cmd.js";
import { routes } from "./routes-cmd.js";
import { files } from "./files-cmd.js";
import { theme } from "./theme-cmd.js";
import { rename } from "./rename-cmd.js";
import { branch } from "./branch-cmd.js";
import { summary } from "./summary-cmd.js";
import { outputStyle } from "./output-style-cmd.js";
import { permissions } from "./permissions-cmd.js";
import { now } from "./now-cmd.js";
import { contextSuggestions } from "./context-suggestions.js";
// Each slash command is a small handler keyed in HANDLERS. executeSlash parses
// the input and dispatches here — no giant switch. Handlers stay pure of console
// side effects (they return text); they may mutate ctx.convo / ctx.state when
// that IS the command's job (/clear, /resume). Reuses existing subsystems.
const help: SlashHandler = () => ({ output: SLASH_HELP });
const exit: SlashHandler = () => ({ exit: true });

const clear: SlashHandler = (_arg, ctx) => {
  ctx.convo.messages.splice(1); // keep the system message, drop history
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

const history: SlashHandler = (_arg, ctx) => ({ output: formatHistory(ctx.convo.messages) || "  (no history yet)" });

const exportConvo: SlashHandler = async (_arg, ctx) => {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const dir = join(ctx.dataDir, "exports");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${ctx.state.sessionId}.md`);
  const body = `# ${ctx.state.title ?? ctx.state.sessionId}\n\n${formatExport(ctx.convo.messages)}\n`;
  await writeFile(file, body, "utf8");
  return { output: `  ⤓ exported to ${file}` };
};

const retry: SlashHandler = (_arg, ctx) => {
  const idx = lastUserIndex(ctx.convo.messages);
  if (idx < 0) return { output: "  (nothing to retry)" };
  const last = ctx.convo.messages[idx];
  const text = last && last.role === "user" ? last.content : "";
  ctx.convo.messages.splice(idx); // drop the user turn + everything after it
  ctx.state.turnIndex = Math.max(0, ctx.state.turnIndex - 1);
  return { output: `  ↻ retrying: ${oneLine(text, 60)}`, resend: text };
};

const undo: SlashHandler = (_arg, ctx) => {
  const idx = lastUserIndex(ctx.convo.messages);
  if (idx < 0) return { output: "  (nothing to undo)" };
  ctx.convo.messages.splice(idx); // drop the last user turn + its response
  ctx.state.turnIndex = Math.max(0, ctx.state.turnIndex - 1);
  return { output: "  ↩ undid the last turn" };
};

const skills: SlashHandler = async (_arg, ctx) => {
  const s = await listSkills(ctx.env);
  if (!s.length) return { output: "  (no skills yet — `vanta skills install`)" };
  // Aligned name column + one-line clipped description (Claude-CLI style) — full
  // multi-sentence descriptions wrap into an unreadable wall otherwise.
  const w = Math.min(24, Math.max(...s.map((x) => x.meta.name.length)) + 2);
  const rows = s.map((x) => `  ${x.meta.name.padEnd(w)}${oneLine(x.meta.description, 72)}`);
  return { output: `  ${s.length} skill(s):\n${rows.join("\n")}` };
};

const tools: SlashHandler = (_arg, ctx) => ({ output: `  ${ctx.setup.registry.schemas().map((s) => s.name).join(", ")}` });

const status: SlashHandler = async (_arg, ctx) => ({ output: formatStatus(await gatherStatus(ctx.env)) });

const plan: SlashHandler = async (_arg, ctx) => {
  const { readTodos, formatTodos } = await import("../todo/store.js");
  return { output: formatTodos(await readTodos(ctx.env)) };
};

const compress: SlashHandler = async (_arg, ctx) => {
  const { compressMessages } = await import("../context.js");
  const { buildSummarizer } = await import("../session.js");
  const before = ctx.convo.messages.length;
  const compressed = await compressMessages(
    ctx.convo.messages,
    ctx.setup.provider.contextWindow(),
    buildSummarizer(ctx.setup.provider),
    { thresholdPct: 0 }, // force compaction now
  );
  ctx.convo.messages.splice(0, Infinity, ...compressed);
  return { output: `  · compressed ${before} → ${compressed.length} messages` };
};

const memory: SlashHandler = async (arg, ctx) => {
  if (!arg) return { output: "  usage: /memory <something to remember>" };
  const { writeRegion } = await import("../brain/store.js");
  await writeRegion("semantic", `- ${arg}`, { append: true, env: ctx.env });
  return { output: `  🧠 remembered: ${oneLine(arg, 80)}` };
};

const goals: SlashHandler = async (_arg, ctx) => {
  const g = await ctx.setup.safety.getGoals().catch(() => []);
  const active = g.filter((x) => x.status === "active");
  return { output: lines(active.map((x) => `  [${x.id}] ${x.text}`), "  (no active goals)") };
};

const sessions: SlashHandler = async (arg, ctx) => {
  const trimmed = arg.trim();
  if (trimmed.toLowerCase().startsWith("search")) {
    return sessionsSearch(trimmed.slice("search".length).trimStart(), ctx);
  }
  const ss = await listSessions(ctx.env);
  return { output: lines(ss.map((s) => `  ${s.id}  ${s.turns} turn(s)  ${s.title}`), "  (no saved sessions)") };
};

const resume: SlashHandler = async (arg, ctx) => {
  if (!arg) return { output: "  usage: /resume <id>  (see /sessions)" };
  const s = await loadSession(arg, ctx.env);
  if (!s) return { output: `  no session "${arg}"` };
  ctx.convo.messages.splice(1, Infinity, ...s.messages.filter((m) => m.role !== "system"));
  ctx.state.sessionId = s.id;
  ctx.state.started = s.started;
  ctx.state.title = s.title;
  ctx.state.turnIndex = s.messages.filter((m) => m.role === "user").length;
  return { output: `  ↻ resumed ${s.id} "${s.title}" (${ctx.state.turnIndex} turn(s))`, resumed: true };
};

const title: SlashHandler = async (arg, ctx) => {
  if (!arg) return { output: "  usage: /title <name>" };
  ctx.state.title = arg;
  // Persist immediately so the title sticks even without a further turn.
  await saveSession(ctx.state.sessionId, ctx.convo.messages, { env: ctx.env, started: ctx.state.started, title: arg }).catch(() => {});
  return { output: `  · session titled "${arg}"` };
};

const fork: SlashHandler = async (_arg, ctx) => {
  // Branch the current transcript into a NEW session id; the original session
  // file is left intact. Future turns save under the fork.
  const newId = newSessionId(ctx.now());
  const startedAt = ctx.now().toISOString();
  await saveSession(newId, ctx.convo.messages, { env: ctx.env, started: startedAt, title: ctx.state.title }).catch(() => {});
  ctx.state.sessionId = newId;
  ctx.state.started = startedAt;
  return { output: `  ⑂ forked into new session ${newId} (history carried over)` };
};

const context: SlashHandler = (_arg, ctx) => {
  const msgs = ctx.convo.messages;
  const chars = msgs.reduce((n, m) => n + (("content" in m ? m.content : "") ?? "").length, 0);
  const est = Math.round(chars / 4);
  const win = ctx.setup.provider.contextWindow();
  const pct = win ? Math.round((est / win) * 100) : 0;
  const sysTok = msgs[0]?.role === "system" ? Math.round(msgs[0].content.length / 4) : 0;
  const byRole = msgs.reduce<Record<string, number>>((acc, m) => ((acc[m.role] = (acc[m.role] ?? 0) + 1), acc), {});
  const filled = Math.round((pct / 100) * 20);
  const bar = "█".repeat(Math.min(20, filled)) + "░".repeat(Math.max(0, 20 - filled));
  const roles = Object.entries(byRole).map(([r, n]) => `${r}:${n}`).join(" · ");
  const breakdown = `  context  [${bar}] ${pct}%  ~${est.toLocaleString()}/${win.toLocaleString()} tok\n  system prompt ~${sysTok.toLocaleString()} tok · ${msgs.length} messages (${roles})`;
  // CC-CONTEXT-SUGGESTIONS: when context is high (≥70%), append concrete removals.
  const tips = contextSuggestions(msgs, win).map((s) => `  ${s.severity === "warning" ? "⚠" : "·"} ${s.text}`);
  return { output: tips.length ? `${breakdown}\n${tips.join("\n")}` : breakdown };
};

const mcp: SlashHandler = async (_arg, ctx) => {
  const { readMcpConfig } = await import("../mcp/mount.js");
  const cfg = await readMcpConfig(ctx.env).catch(() => ({ servers: {} as Record<string, unknown> }));
  const names = Object.keys(cfg.servers ?? {});
  return { output: lines(names.map((n) => `  ${n}`), "  (no MCP servers — set VANTA_MCP_SERVERS or ~/.vanta/mcp.json)") };
};

const usage: SlashHandler = (_arg, ctx) => {
  const chars = ctx.convo.messages.reduce((n, m) => n + (("content" in m ? m.content : "") ?? "").length, 0);
  const est = Math.round(chars / 4); // ~4 chars/token, matches the status bar's estimate
  const ctxWin = ctx.setup.provider.contextWindow();
  const pct = ctxWin ? Math.round((est / ctxWin) * 100) : 0;
  return {
    output:
      `  ~${est.toLocaleString()} tokens / ${ctxWin.toLocaleString()} ctx (${pct}%) · ${ctx.state.turnIndex} turn(s) · ${ctx.setup.provider.modelId()}\n` +
      `  ${formatSessionCost(ctx.state.sessionCost)}`,
  };
};

const copy: SlashHandler = async (_arg, ctx) => {
  const last = [...ctx.convo.messages].reverse().find((m) => m.role === "assistant" && m.content.trim());
  if (!last || last.role !== "assistant") return { output: "  (nothing to copy)" };
  try {
    const { spawn } = await import("node:child_process");
    const p = spawn("pbcopy");
    p.stdin.end(last.content);
    return { output: "  📋 copied the last response to the clipboard" };
  } catch {
    return { output: "  copy failed (pbcopy unavailable)" };
  }
};

const update: SlashHandler = async (_arg, ctx) => {
  const repoRoot = dirname(ctx.dataDir); // dataDir is <repoRoot>/.vanta
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { stdout } = await promisify(execFile)("git", ["-C", repoRoot, "pull", "--ff-only"]);
    return { output: `  ⬆ ${stdout.trim() || "already up to date"}\n  · run ./install.sh to rebuild if anything changed` };
  } catch (err) {
    return { output: `  update failed: ${(err as Error).message.split("\n")[0]}` };
  }
};

const image: SlashHandler = async (arg, ctx) => {
  if (!arg) return { output: "  usage: /image <path>" };
  try {
    const { readFile } = await import("node:fs/promises");
    const abs = arg.startsWith("~") ? join(homedir(), arg.slice(1)) : arg;
    const buf = await readFile(abs);
    const mime = mimeFromPath(abs);
    (ctx.state.pendingImages ??= []).push({ mime, dataBase64: buf.toString("base64") });
    return { output: `  🖼  attached ${basename(abs)} (${mime}, ${Math.round(buf.length / 1024)}KB) — send a message to ask about it` };
  } catch (err) {
    return { output: `  could not read image: ${(err as Error).message.split("\n")[0]}` };
  }
};

const paste: SlashHandler = async (_arg, ctx) => {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { readFile, rm } = await import("node:fs/promises");
    const tmp = join(tmpdir(), `vanta-paste-${ctx.now().getTime()}.png`);
    // macOS: dump the clipboard image to a file via AppleScript.
    const script = `set f to (open for access (POSIX file "${tmp}") with write permission)\ntry\nwrite (the clipboard as «class PNGf») to f\nend try\nclose access f`;
    await promisify(execFile)("osascript", ["-e", script]);
    const buf = await readFile(tmp).catch(() => Buffer.alloc(0));
    await rm(tmp, { force: true }).catch(() => {});
    if (!buf.length) return { output: "  (no image on the clipboard — copy one, or use /image <path>)" };
    (ctx.state.pendingImages ??= []).push({ mime: "image/png", dataBase64: buf.toString("base64") });
    return { output: `  🖼  pasted clipboard image (${Math.round(buf.length / 1024)}KB) — send a message to ask about it` };
  } catch (err) {
    return { output: `  paste failed (macOS only): ${(err as Error).message.split("\n")[0]} — try /image <path>` };
  }
};

const cron: SlashHandler = async (_arg, ctx) => {
  const entries = await loadCron(ctx.dataDir);
  return { output: lines(entries.map((e) => `  #${e.id} [${e.status}] ${e.cron} — ${e.instruction}`), "  (no scheduled tasks)") };
};

/** Command-name → handler. Aliases share a handler (clear/new/reset, exit/quit, status/doctor). */
export const HANDLERS: Record<string, SlashHandler> = {
  help, exit, quit: exit, clear, new: clear, reset: clear, attachments, history,
  export: exportConvo, retry, undo, skills, tools, model, status, doctor: status,
  plan, compress, memory, goals, goal, sessions, resume, title, fork, context,
  mcp, usage, copy, update, image, paste, cron, moim, next, now, planmode: planMode, boundary, where, wm, restart, bug, handoff, open, edit, tasks, btw, diff, search, dashboard, repro, brief, review, simplify, verify, run,
  routes, files, theme, rename, branch, summary, "output-style": outputStyle, permissions,
  "add-dir": addDir,
};

/** Look up + run a parsed command; returns null for an unknown command. */
export async function dispatch(cmd: string, arg: string, ctx: ReplCtx): Promise<SlashResult | null> {
  const handler = HANDLERS[cmd];
  return handler ? handler(arg, ctx) : null;
}
