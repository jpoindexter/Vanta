import type { SessionMeta } from "./store.js";

// Cross-project resume: pure helpers over session listings so a session can be
// surfaced and resumed even when it was started in a different project root.
// `listSessions` already exposes `projectId` (origin project) on each record;
// these functions annotate, label, and partition that listing. All pure —
// no fs/env access — so the cross-project picker logic is fully unit-tested.

/** Sessions that predate projectId have none — treat them as project-less. */
const NO_PROJECT_LABEL = "(unknown project)";

/** Min input: a session record carrying its origin project id (may be absent). */
export type ProjectScopedSession = Pick<SessionMeta, "projectId">;

/** A session annotated with a resolved projectId + a human display label. */
export type AnnotatedSession<T extends ProjectScopedSession> = T & {
  /** Origin projectId, or null when the session was saved before projectId existed. */
  projectId: string | null;
  /** Display label for the project column in a resume picker. */
  projectLabel: string;
};

/**
 * Attach a resolved `projectId` (null when absent) + a display label to a
 * session. Pure mapper — the building block for the listing/filters below.
 */
export function withProjectId<T extends ProjectScopedSession>(session: T): AnnotatedSession<T> {
  const projectId = session.projectId ?? null;
  return {
    ...session,
    projectId,
    projectLabel: projectId ?? NO_PROJECT_LABEL,
  };
}

/**
 * Annotate every session with its origin projectId + label, for a cross-project
 * resume picker that lists sessions from all projects at once.
 */
export function listAllProjectsSessions<T extends ProjectScopedSession>(
  sessions: readonly T[],
): AnnotatedSession<T>[] {
  return sessions.map(withProjectId);
}

/**
 * Keep only sessions belonging to `projectId` (same-project resume).
 * A session with no projectId never matches a concrete project id.
 */
export function filterByProject<T extends ProjectScopedSession>(
  sessions: readonly T[],
  projectId: string,
): T[] {
  return sessions.filter((s) => (s.projectId ?? null) === projectId);
}

/**
 * Keep only sessions from OTHER projects than `currentProjectId` — the candidates
 * for a cross-project resume picker. Sessions with no projectId are included
 * (their origin is unknown, so they're not the current project's own).
 */
export function filterCrossProject<T extends ProjectScopedSession>(
  sessions: readonly T[],
  currentProjectId: string,
): T[] {
  return sessions.filter((s) => (s.projectId ?? null) !== currentProjectId);
}
