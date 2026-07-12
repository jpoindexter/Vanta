import { listSessions, loadSession, newSessionId, saveSession } from "../sessions/store.js";
import { lines } from "./format.js";
import { sessionsSearch } from "./sessions-search-cmd.js";
import type { SlashHandler } from "./types.js";
import { providerIdFor, resolveSessionModel } from "../sessions/model-scope.js";
import { buildSummarizer } from "../session.js";

export const sessions: SlashHandler = async (arg, ctx) => {
  const trimmed = arg.trim();
  if (trimmed.toLowerCase().startsWith("search")) {
    return sessionsSearch(trimmed.slice("search".length).trimStart(), ctx);
  }
  const ss = await listSessions(ctx.env);
  return { output: lines(ss.map((s) => `  ${s.id}  ${s.turns} turn(s)  ${s.title}`), "  (no saved sessions)") };
};

export const resume: SlashHandler = async (arg, ctx) => {
  if (!arg) return { output: "  usage: /resume <id>  (see /sessions)" };
  const s = await loadSession(arg, ctx.env);
  if (!s) return { output: `  no session "${arg}"` };
  ctx.convo.messages.splice(1, Infinity, ...s.messages.filter((m) => m.role !== "system"));
  ctx.state.sessionId = s.id;
  ctx.state.started = s.started;
  ctx.state.title = s.title;
  ctx.state.turnIndex = s.messages.filter((m) => m.role === "user").length;
  const provider = resolveSessionModel(s, ctx.env);
  if (provider) {
    ctx.convo.setProvider(provider, buildSummarizer(provider));
    ctx.setup.provider = provider;
  }
  ctx.state.providerId = s.providerId ?? providerIdFor(ctx.setup.provider, ctx.env);
  ctx.state.modelId = s.modelId ?? ctx.setup.provider.modelId();
  return { output: `  ↻ resumed ${s.id} "${s.title}" (${ctx.state.turnIndex} turn(s))`, resumed: true };
};

export const title: SlashHandler = async (arg, ctx) => {
  if (!arg) return { output: "  usage: /title <name>" };
  ctx.state.title = arg;
  await saveSession(ctx.state.sessionId, ctx.convo.messages, { env: ctx.env, started: ctx.state.started, title: arg, providerId: ctx.state.providerId, modelId: ctx.state.modelId }).catch(() => {});
  return { output: `  · session titled "${arg}"` };
};

export const fork: SlashHandler = async (_arg, ctx) => {
  const newId = newSessionId(ctx.now());
  const startedAt = ctx.now().toISOString();
  await saveSession(newId, ctx.convo.messages, { env: ctx.env, started: startedAt, title: ctx.state.title, providerId: ctx.state.providerId, modelId: ctx.state.modelId }).catch(() => {});
  ctx.state.sessionId = newId;
  ctx.state.started = startedAt;
  return { output: `  ⑂ forked into new session ${newId} (history carried over)` };
};
