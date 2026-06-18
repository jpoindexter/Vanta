// BRAIN-INGEST-GATE — Context vs Connections. The 5-level-second-brain rule:
// never COPY volatile data (Slack/email/customer threads, statuses, counts, prices)
// into durable memory — it rots into noise to prune. Store a POINTER to fetch it
// live instead. This is a pure, deterministic backstop under the learn pass's LLM
// (which is already told to skip transient state, but may leak it). Volatile
// candidates become live-access pointers (source + fetch hint, value dropped);
// evergreen candidates store normally.

export type IngestClass = "evergreen" | "volatile";

export const LIVE_POINTER_PREFIX = "↪ live";

// Signals that a fact's VALUE is time-sensitive and will go stale if copied.
const VOLATILE_RE = new RegExp(
  [
    "\\bcurrently\\b", "\\bright now\\b", "\\bas of (?:today|now|this)\\b",
    "\\b(?:is|are) now\\b", "\\bso far\\b", "\\blatest\\b", "\\bup to date\\b",
    "\\bunread\\b", "\\binbox\\b", "\\bpending\\b", "\\bwaiting (?:on|for)\\b",
    "\\bonline now\\b", "\\blogged in\\b", "\\bstatus (?:is|:)\\b", "\\bdeal stage\\b",
    "\\bprice is\\b", "\\bcosts? \\$", "\\$[0-9]", "\\b[0-9]+%", "\\bbalance\\b",
    "\\bdue (?:today|tomorrow|this)\\b", "\\bthis (?:week|morning|afternoon|hour)\\b",
  ].join("|"),
  "i",
);

// Where to fetch the live value from, by mentioned source. First match wins.
const SOURCE_HINTS: ReadonlyArray<{ re: RegExp; source: string }> = [
  { re: /\bslack\b/i, source: "Slack" },
  { re: /\b(?:e-?mail|gmail|inbox)\b/i, source: "email" },
  { re: /\b(?:calendar|meeting|event)\b/i, source: "calendar" },
  { re: /\b(?:message|dm|imessage|text|whatsapp|telegram)\b/i, source: "messages" },
  { re: /\b(?:github|pull request|\bpr\b|issue)\b/i, source: "GitHub" },
  { re: /\b(?:drive|doc|sheet|spreadsheet|notion)\b/i, source: "Drive/docs" },
];

/** Classify a learn candidate. Pure. Volatile = its value will go stale if copied. */
export function classifyIngest(content: string): IngestClass {
  return VOLATILE_RE.test(content) ? "volatile" : "evergreen";
}

function detectSource(content: string): string {
  return SOURCE_HINTS.find((h) => h.re.test(content))?.source ?? "the source system";
}

// Drop the volatile value: keep only the subject (text before the value clause).
const VALUE_SPLIT_RE = /\s+(?:is now|is currently|are now|is|are|:|=|now|currently|so far)\b/i;

function extractSubject(content: string): string {
  const stripped = content.trim().replace(/^(?:the|my|a|an)\s+/i, "");
  const head = stripped.split(VALUE_SPLIT_RE)[0]?.trim() ?? stripped;
  return head.length >= 3 ? head : stripped;
}

export type LivePointer = { source: string; subject: string; text: string };

/** Derive a live-access pointer from a volatile fact — names the subject + source,
 * never the (stale-prone) value. Pure. */
export function toLivePointer(content: string): LivePointer {
  const source = detectSource(content);
  const subject = extractSubject(content);
  return {
    source,
    subject,
    text: `${LIVE_POINTER_PREFIX}[${source}]: ${subject} — fetch the current value live; do not trust a cached copy.`,
  };
}

/** True when an entry's content is a live-access pointer (not a copied value). */
export function isLivePointer(content: string): boolean {
  return content.startsWith(LIVE_POINTER_PREFIX);
}
