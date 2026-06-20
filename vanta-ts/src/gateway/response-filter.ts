// MSG-NO-REPLY-TOKEN — intentional-silence detection for group/channel surfaces.
// An always-replying bot is noise in a group chat. The agent can return an exact
// whole-response marker to choose NOT to reply. Prose that merely mentions the
// marker still delivers; only a response that IS the marker (after trim) suppresses.

/** Exact markers that signal "do not reply". A response equal to one of these (trimmed) is silenced. */
const SILENCE_MARKERS: readonly string[] = ["NO_REPLY", "[SILENT]"];

/** Upper bound on a silence marker so a long marker-prefixed prose block can't be mistaken for silence. */
const MAX_MARKER_LENGTH = 64;

/**
 * True only when the trimmed whole response is exactly one silence marker
 * and within the length bound. Prose containing a marker, or a blank response,
 * returns false (blank stays the existing no-op/error path; prose still sends).
 */
export function isIntentionalSilence(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_MARKER_LENGTH) return false;
  return SILENCE_MARKERS.includes(trimmed);
}
