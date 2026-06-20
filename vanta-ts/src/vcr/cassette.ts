import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * VCR cassettes — recorded outbound API request/response pairs for deterministic
 * test replay. Pure + injectable: matching is by a stable key over
 * (method, url, body), so a recorded response can be served back for an
 * equivalent request with no live network.
 *
 * This module is the data layer (record/match/load/save); `vcr-fetch.ts` wraps a
 * real fetch with it. Nothing here touches the live fetch path — that is a
 * deliberate follow-up.
 */

const BODY_HASH_LEN = 16;

export const RecordedRequestSchema = z.object({
  method: z.string().min(1),
  url: z.string().min(1),
  bodyHash: z.string(),
});

export const RecordedResponseSchema = z.object({
  status: z.number().int(),
  body: z.string(),
});

export const InteractionSchema = z.object({
  request: RecordedRequestSchema,
  response: RecordedResponseSchema,
});

export const CassetteSchema = z.array(InteractionSchema);

export type RecordedRequest = z.infer<typeof RecordedRequestSchema>;
export type RecordedResponse = z.infer<typeof RecordedResponseSchema>;
export type Interaction = z.infer<typeof InteractionSchema>;
export type Cassette = z.infer<typeof CassetteSchema>;

/** Stable, body-sensitive hash for a request body (sha256 prefix). Pure. */
function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex").slice(0, BODY_HASH_LEN);
}

/**
 * Stable match key for a request. Same (method, url, body) → same key; any
 * change to the body changes the key. Method is upper-cased so `get`/`GET`
 * match. Pure.
 */
export function requestKey(method: string, url: string, body: string): string {
  return `${method.toUpperCase()} ${url} ${hashBody(body)}`;
}

/** Build the recorded-request shape (method normalized, body hashed). Pure. */
export function toRecordedRequest(method: string, url: string, body: string): RecordedRequest {
  return { method: method.toUpperCase(), url, bodyHash: hashBody(body) };
}

function keyOf(req: RecordedRequest): string {
  return `${req.method.toUpperCase()} ${req.url} ${req.bodyHash}`;
}

/**
 * Append an interaction to the cassette, returning a NEW cassette (input is not
 * mutated). Pure.
 */
export function recordInteraction(
  cassette: Cassette,
  request: RecordedRequest,
  response: RecordedResponse,
): Cassette {
  return [...cassette, { request, response }];
}

/**
 * Find the recorded response for a request, or null if none matches. Matches on
 * the stable request key (method + url + body hash). First match wins. Pure.
 */
export function findInteraction(cassette: Cassette, request: RecordedRequest): RecordedResponse | null {
  const wanted = keyOf(request);
  const hit = cassette.find((i) => keyOf(i.request) === wanted);
  return hit ? hit.response : null;
}

/** Injected fs surface — keeps load/save testable with no real files. */
export interface CassetteFs {
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

/**
 * Load a cassette from `path` via injected fs. A missing file → empty cassette
 * (recording starts fresh). A corrupt/invalid file → empty cassette (tolerant
 * reader; never throws across the boundary). Errors-as-values: returns the
 * cassette, never rejects on a bad store.
 */
export async function loadCassette(fs: CassetteFs, path: string): Promise<Cassette> {
  if (!(await fs.exists(path))) return [];
  try {
    const parsed = CassetteSchema.safeParse(JSON.parse(await fs.read(path)));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Persist a cassette to `path` via injected fs (pretty JSON for diff-ability). */
export async function saveCassette(fs: CassetteFs, path: string, cassette: Cassette): Promise<void> {
  await fs.write(path, JSON.stringify(cassette, null, 2));
}
