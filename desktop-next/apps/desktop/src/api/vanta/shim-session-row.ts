import type { SessionInfo } from '@/types/hermes'

import type { SessionMeta } from './schemas'

const SECONDS = 1000

export const isoToSeconds = (iso: string | undefined): number => {
  const ms = iso ? Date.parse(iso) : Number.NaN

  return Number.isNaN(ms) ? 0 : ms / SECONDS
}

/** A Hermes session row for something Vanta stores as a session; unknown counters stay zero. */
export function sessionRow(fields: Partial<SessionInfo> & Pick<SessionInfo, 'id'>): SessionInfo {
  return {
    archived: false,
    cwd: null,
    ended_at: null,
    input_tokens: 0,
    is_active: false,
    is_default_profile: true,
    last_active: 0,
    message_count: 0,
    model: null,
    output_tokens: 0,
    pinned: false,
    preview: null,
    profile: 'default',
    source: 'vanta',
    started_at: 0,
    title: null,
    tool_call_count: 0,
    ...fields
  }
}

/**
 * A Hermes sidebar row for one stored session. `cwd` is the folder the session was started in, as the
 * server recorded it; a session saved before that was kept has none and files under Home, never under a guess.
 */
export function sessionInfoFromMeta(meta: SessionMeta): SessionInfo {
  const started = isoToSeconds(meta.started)

  return sessionRow({
    archived: meta.archived === true,
    cwd: meta.cwd?.trim() || null,
    id: meta.id,
    last_active: isoToSeconds(meta.updated) || started,
    message_count: (meta.turns ?? 0) * 2,
    model: meta.modelId ?? null,
    pinned: meta.pinned === true,
    started_at: started,
    ...(meta.unread === true ? { unread: true } : {}),
    title: meta.title ?? null
  })
}
