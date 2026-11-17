import { isAbsolute, relative } from "node:path";
import { flattenMessageText } from "../agent/flatten-text.js";
import { tokenize } from "../search/life-rank.js";
import { searchSessions as rankSessions, type SearchableSession } from "../search/cross-session.js";
import { canonicalProjectId } from "../projects/identity.js";
import { redactForLog } from "../store/redact-structural.js";
import { listSessions, loadSession, type SessionMeta } from "./store.js";

// Model-facing search over the owner's saved sessions. Reuses the cross-session
// ranker (the one the desktop global-search dialog uses); this module only adds
// what an agent needs on top: scope filtering, a snippet centred on the match,
// and redaction, because the result re-enters the model's prompt.

/** Newest sessions scanned per call. The store is a JSON-file scan, so this bounds latency. */
export const SESSION_WINDOW = 100;
export const SNIPPET_CHARS = 240;
const SNIPPET_LEAD_CHARS = 80;
// Two, because the question and its answer are usually adjacent turns that both match.
export const MAX_HITS_PER_SESSION = 2;
// cross-session.ts truncates scoring input to ~160 chars.
const RANK_WINDOW_CHARS = 160;

export type AgentSearchHit = {
  sessionId: string;
  title: string;
  /** YYYY-MM-DD of the session's last update. */
  date: string;
  /** 1-based position among user/assistant messages, same numbering as `/sessions search`. */
  turnIndex: number;
  role: "user" | "assistant";
  snippet: string;
};

export type AgentSearchResult = { hits: AgentSearchHit[]; searched: number; eligible: number };

export type AgentSearchOptions = {
  query: string;
  limit: number;
  env: NodeJS.ProcessEnv;
  /** Project root of the calling tool; sessions known to belong elsewhere are skipped. */
  root: string;
  /** The live session is excluded: the model already has it in context. */
  currentSessionId?: string;
};

type Turn = { role: "user" | "assistant"; text: string };
type LoadedSession = { meta: SessionMeta; turns: Turn[] };

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Skip only sessions KNOWN to belong to another project; legacy sessions with no origin stay searchable. */
function isForeignProject(meta: SessionMeta, root: string, projectId: string | undefined): boolean {
  if (meta.projectId && projectId) return meta.projectId !== projectId;
  if (meta.cwd) return !isInside(root, meta.cwd) && !isInside(meta.cwd, root);
  return false;
}

async function loadTurns(meta: SessionMeta, env: NodeJS.ProcessEnv): Promise<LoadedSession | null> {
  const session = await loadSession(meta.id, env).catch(() => null);
  if (!session) return null;
  const turns: Turn[] = [];
  for (const message of session.messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    turns.push({ role: message.role, text: flattenMessageText(message.content) });
  }
  return { meta, turns };
}

function windowAround(flat: string, query: string, size: number): string {
  const lower = flat.toLowerCase();
  const terms = [query.trim().toLowerCase(), ...tokenize(query).sort((a, b) => b.length - a.length)];
  const found = terms.map((term) => (term ? lower.indexOf(term) : -1)).find((index) => index >= 0) ?? 0;
  const start = Math.max(0, found - SNIPPET_LEAD_CHARS);
  const end = Math.min(flat.length, start + size);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

const flatten = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Window around the first query-term occurrence; redacted before it is cut so a secret never straddles the edge. */
export function centredSnippet(text: string, query: string): string {
  return windowAround(flatten(redactForLog(text)), query, SNIPPET_CHARS);
}

/** The ranker only scores the head of each message, so hand it the matched region instead. */
function toSearchable(loaded: LoadedSession[], query: string): SearchableSession[] {
  return loaded.map(({ meta, turns }) => ({
    id: meta.id,
    title: meta.title,
    messages: turns.map((t) => ({ role: t.role, content: windowAround(flatten(t.text), query, RANK_WINDOW_CHARS) })),
  }));
}

/** Ranked hits, at most MAX_HITS_PER_SESSION per session so one long thread cannot crowd out the rest. */
export async function searchSessionsForAgent(opts: AgentSearchOptions): Promise<AgentSearchResult> {
  const projectId = await canonicalProjectId(opts.root).catch(() => undefined);
  const metas = (await listSessions(opts.env).catch(() => [])).filter(
    (meta) => !meta.diagnostic && meta.id !== opts.currentSessionId && !isForeignProject(meta, opts.root, projectId),
  );
  const window = metas.slice(0, SESSION_WINDOW);
  const loaded = (await Promise.all(window.map((meta) => loadTurns(meta, opts.env)))).filter((s): s is LoadedSession => s !== null);
  const byId = new Map(loaded.map((s) => [s.meta.id, s]));
  const hits: AgentSearchHit[] = [];
  const perSession = new Map<string, number>();
  for (const ranked of rankSessions(opts.query, toSearchable(loaded, opts.query))) {
    if (hits.length >= opts.limit) break;
    const session = byId.get(ranked.sessionId);
    const turn = session?.turns[ranked.messageIndex];
    const taken = perSession.get(ranked.sessionId) ?? 0;
    if (!session || !turn || taken >= MAX_HITS_PER_SESSION) continue;
    perSession.set(ranked.sessionId, taken + 1);
    hits.push({
      sessionId: session.meta.id,
      title: redactForLog(session.meta.title),
      date: (session.meta.updated || session.meta.started).slice(0, 10),
      turnIndex: ranked.messageIndex + 1,
      role: turn.role,
      snippet: centredSnippet(turn.text, opts.query),
    });
  }
  return { hits, searched: loaded.length, eligible: metas.length };
}
