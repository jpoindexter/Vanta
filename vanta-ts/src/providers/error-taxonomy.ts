// HARNESS-ERROR-TAXONOMY — categorized provider-error classifier.
// Turns a raw provider error (Error | string | unknown) into a typed verdict
// with explicit recovery hints, so callers act on a category instead of
// re-parsing strings. Pure: one input → one verdict, no I/O, no globals.

/** The category a provider error falls into. */
export type ErrorReason =
  | "auth" // transient/recoverable auth (e.g. expired token, retry may refresh)
  | "auth_permanent" // bad/revoked key — never recoverable by retry or fallback
  | "billing" // quota/credit exhausted — a different provider may still work
  | "rate_limit" // transient throttling — backing off and retrying helps
  | "overloaded" // provider capacity (e.g. Anthropic 529) — retry/fallback helps
  | "server_error" // 5xx — transient on the provider side
  | "timeout" // request timed out — retry
  | "network" // connection-level failure — retry
  | "context_overflow" // input exceeds the context window — compress, then retry
  | "payload_too_large" // request body too large (413) — compress, then retry
  | "image_too_large" // an attached image exceeds limits — drop/shrink it
  | "content_policy" // moderation/safety refusal — neither retry nor fallback helps
  | "model_not_found" // unknown/unavailable model — fall back, don't retry
  | "bad_request" // malformed request (400) — retry won't help
  | "not_found" // 404 on a non-model resource — retry won't help
  | "unknown"; // unclassified — conservative defaults

/** A typed verdict over a provider error. */
export type ErrorVerdict = {
  reason: ErrorReason;
  /** Retrying the SAME provider may succeed (transient/server-side). */
  retryable: boolean;
  /** The input was too large — compress the conversation before retrying. */
  shouldCompress: boolean;
  /** Rotate credentials/key (a refresh or re-auth may recover). */
  shouldRotate: boolean;
  /** Try the NEXT provider in the chain (this one can't serve the request). */
  shouldFallback: boolean;
};

/** Case-insensitive keyword/regex bank for one category. Order = priority. */
type Bank = { reason: ErrorReason; test: RegExp };

// Billing/credit exhaustion. Distinguished from transient rate_limit by
// keyword: "insufficient_quota", "billing", "credit", "balance", "exceeded
// your current quota". These mean "you ran out", not "slow down" — a retry
// won't help, but a different provider/key might.
const BILLING =
  /(insufficient[_\s-]?quota|exceeded your (current )?quota|billing|payment required|\b402\b|out of (credit|credits)|credit balance|account balance|not enough (credit|balance|funds)|quota exceeded|spending limit|hard limit reached)/i;

// Transient throttling — slow down and retry. 429 WITHOUT a billing keyword.
const RATE_LIMIT =
  /(rate[\s-]?limit|too many requests|\b429\b|requests per (minute|second|day)|\brpm\b|\btpm\b|throttl|please (slow down|try again later)|retry after)/i;

// Provider capacity / overload (Anthropic 529 "overloaded_error", "model is
// overloaded"). Transient — retry or fall back.
const OVERLOADED =
  /(overloaded|\b529\b|server is busy|capacity|temporarily unavailable|service is at capacity|model is currently overloaded)/i;

// 5xx server-side errors (excluding 529, handled above). Transient.
const SERVER_ERROR =
  /(\b(500|502|503|504)\b|internal server error|bad gateway|service unavailable|gateway timeout|server error|upstream)/i;

const TIMEOUT = /(ETIMEDOUT|EAI_AGAIN|timed?\s?out|timeout|deadline exceeded|request timed out)/i;

const NETWORK =
  /(ECONNRESET|ECONNREFUSED|ENOTFOUND|EPIPE|socket hang up|network error|connection (reset|refused|closed|error)|fetch failed|getaddrinfo|dns)/i;

// Context-window overflow — the prompt is too big. Compress, then retry.
const CONTEXT_OVERFLOW =
  /(context[_\s-]?(length|window)|maximum context|too many tokens|reduce the length|input is too long|prompt is too long|exceeds the (maximum|model'?s) (context|token)|context_length_exceeded|max_tokens.*context)/i;

// 413 / oversized request body — compress.
const PAYLOAD_TOO_LARGE =
  /(\b413\b|payload too large|request entity too large|request too large|body (exceeded|too large)|maximum (request|payload) size)/i;

// Image-specific size/format limits — drop or shrink the image.
const IMAGE_TOO_LARGE =
  /(image (exceeds|too large|is too big|size)|image dimensions|images may not|image file (size|too)|unsupported image|could not process image)/i;

// Moderation / content-policy refusal. Neither retry nor fallback recovers it.
const CONTENT_POLICY =
  /(content[_\s-]?policy|content[_\s-]?filter|moderation|safety (system|filter|guidelines)|flagged|violat(es|ed|ion).*(policy|guideline)|responsibleai|prompt was blocked|blocked by (the )?(content|safety))/i;

// Permanent auth — a bad/revoked/missing key. Rotate the key; don't retry.
const AUTH_PERMANENT =
  /(\b(401|403|407)\b|invalid api[_\s-]?key|incorrect api[_\s-]?key|api[_\s-]?key.*(invalid|missing|expired|revoked|not (found|valid))|unauthorized|forbidden|authentication[_\s-]?(failed|error)|no api key|permission denied|access denied|invalid[_\s-]?token|token.*(invalid|revoked))/i;

// Recoverable auth — an expired/refreshable token. Rotate (refresh) then retry.
const AUTH_TRANSIENT =
  /(token (has )?expired|expired (access|oauth|bearer) token|refresh (the )?token|session expired|credentials? expired|re-?authenticate)/i;

const MODEL_NOT_FOUND =
  /(model[_\s-]?not[_\s-]?found|model.*(does not exist|not (found|available|supported|exist)|is not available|unknown)|no such model|unsupported model|invalid model|the model `.*` does not exist|deprecated model)/i;

const NOT_FOUND = /(\b404\b|not found)/i;
const BAD_REQUEST = /(\b400\b|bad request|invalid request|malformed|invalid[_\s-]?request_error|ENOENT)/i;

// Priority-ordered: the FIRST matching bank wins. Specific categories
// (billing, image, context, model, auth) precede coarse ones (server, network,
// 400/404) so a 5xx with "overloaded" classifies as overloaded, and a 429 with
// "insufficient_quota" classifies as billing rather than rate_limit.
const BANKS: Bank[] = [
  { reason: "auth_permanent", test: AUTH_PERMANENT },
  { reason: "auth", test: AUTH_TRANSIENT },
  { reason: "billing", test: BILLING },
  { reason: "content_policy", test: CONTENT_POLICY },
  { reason: "image_too_large", test: IMAGE_TOO_LARGE },
  { reason: "context_overflow", test: CONTEXT_OVERFLOW },
  { reason: "payload_too_large", test: PAYLOAD_TOO_LARGE },
  { reason: "model_not_found", test: MODEL_NOT_FOUND },
  { reason: "rate_limit", test: RATE_LIMIT },
  { reason: "overloaded", test: OVERLOADED },
  { reason: "server_error", test: SERVER_ERROR },
  { reason: "timeout", test: TIMEOUT },
  { reason: "network", test: NETWORK },
  // bad_request precedes not_found: ENOENT messages ("...file not found")
  // are malformed requests, not 404s — match the specific 4xx code first.
  { reason: "bad_request", test: BAD_REQUEST },
  { reason: "not_found", test: NOT_FOUND },
];

/** Per-category recovery hints. The classifier looks these up by reason. */
const HINTS: Record<ErrorReason, Omit<ErrorVerdict, "reason">> = {
  auth: { retryable: true, shouldCompress: false, shouldRotate: true, shouldFallback: false },
  auth_permanent: { retryable: false, shouldCompress: false, shouldRotate: true, shouldFallback: false },
  billing: { retryable: false, shouldCompress: false, shouldRotate: false, shouldFallback: true },
  rate_limit: { retryable: true, shouldCompress: false, shouldRotate: false, shouldFallback: true },
  overloaded: { retryable: true, shouldCompress: false, shouldRotate: false, shouldFallback: true },
  server_error: { retryable: true, shouldCompress: false, shouldRotate: false, shouldFallback: true },
  timeout: { retryable: true, shouldCompress: false, shouldRotate: false, shouldFallback: true },
  network: { retryable: true, shouldCompress: false, shouldRotate: false, shouldFallback: true },
  context_overflow: { retryable: true, shouldCompress: true, shouldRotate: false, shouldFallback: false },
  payload_too_large: { retryable: true, shouldCompress: true, shouldRotate: false, shouldFallback: false },
  image_too_large: { retryable: false, shouldCompress: false, shouldRotate: false, shouldFallback: false },
  content_policy: { retryable: false, shouldCompress: false, shouldRotate: false, shouldFallback: false },
  model_not_found: { retryable: false, shouldCompress: false, shouldRotate: false, shouldFallback: true },
  bad_request: { retryable: false, shouldCompress: false, shouldRotate: false, shouldFallback: false },
  not_found: { retryable: false, shouldCompress: false, shouldRotate: false, shouldFallback: false },
  unknown: { retryable: false, shouldCompress: false, shouldRotate: false, shouldFallback: false },
};

/** Normalizes any thrown value to a searchable message string. */
export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    // Provider SDKs often attach `status`/`code`/`error.message`; fold them in.
    const o = err as Record<string, unknown>;
    const parts = [o.message, o.code, o.status, o.type, errorText((o.error as unknown) ?? "")];
    const joined = parts.filter((p) => p !== undefined && p !== "").join(" ");
    if (joined.trim()) return joined;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/**
 * Classify a provider error into a typed recovery verdict.
 *
 * Pure: matches the error's text against priority-ordered keyword banks and
 * returns the first category's recovery hints. Unmatched input is `unknown`
 * with conservative defaults (don't retry, don't fall back). Billing
 * exhaustion is separated from transient `rate_limit` by keyword bank so a
 * retry isn't wasted on an exhausted quota.
 */
export function classifyProviderError(err: unknown): ErrorVerdict {
  const text = errorText(err);
  for (const bank of BANKS) {
    if (bank.test.test(text)) {
      return { reason: bank.reason, ...HINTS[bank.reason] };
    }
  }
  return { reason: "unknown", ...HINTS.unknown };
}
