import type { Session } from "./types.js";

/** Existing associations only: unknown provenance must not become a guessed project. */
export function groupProjectChats(sessions: Session[]) {
  const general: Session[] = [];
  const projects = new Map<string, Session[]>();
  for (const session of sessions) {
    if (!session.projectId) { general.push(session); continue; }
    const rows = projects.get(session.projectId) ?? [];
    rows.push(session);
    projects.set(session.projectId, rows);
  }
  return { general, projects: [...projects].map(([id, rows]) => ({ id, sessions: rows })) };
}
