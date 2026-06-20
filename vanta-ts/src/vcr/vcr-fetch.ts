import {
  toRecordedRequest,
  recordInteraction,
  findInteraction,
  type Cassette,
} from "./cassette.js";

/**
 * A VCR layer over a fetch-shaped function. Three modes:
 *  - off:    pass straight through to the real fetch (no behavior change).
 *  - record: call the real fetch, append the request/response to the cassette,
 *            and persist it (so a later replay run is deterministic).
 *  - replay: serve the recorded response for a matching request; on a miss,
 *            return a clear error WITHOUT touching the network.
 *
 * Off by default (see `resolveVcrMode`). Pure orchestration over injected
 * `realFetch` / `save` — no real network or files needed to test it. This module
 * does NOT wrap the live fetch path; that is a deliberate follow-up. The intended
 * wrap point is each provider's outbound `fetch` (e.g. the native fetch used by
 * `providers/*`), so a test run can record once and replay offline.
 */

export type VcrMode = "off" | "record" | "replay";

/** Read VCR mode from env. Default off — no behavior change unless opted in. */
export function resolveVcrMode(env: NodeJS.ProcessEnv = process.env): VcrMode {
  const raw = env.VANTA_VCR?.trim().toLowerCase();
  return raw === "record" || raw === "replay" ? raw : "off";
}

/** Minimal fetch-shaped function. Matches native `fetch`'s call signature. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface VcrFetchOptions {
  mode: VcrMode;
  /** Mutable cassette the layer reads from / records onto. */
  cassette: Cassette;
  /** The real fetch to delegate to (off + record). */
  realFetch: FetchLike;
  /**
   * Persist the cassette after a record. Injected so tests assert saves without
   * disk. Optional in off/replay; required in practice for record to be useful.
   */
  save?: (cassette: Cassette) => Promise<void>;
}

/** Stringify a fetch URL argument to a stable string. Pure. */
function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/** Resolve the HTTP method from input/init (defaults to GET). Pure. */
function methodOf(input: string | URL | Request, init?: RequestInit): string {
  if (init?.method) return init.method;
  if (typeof input !== "string" && !(input instanceof URL)) return input.method || "GET";
  return "GET";
}

/** Resolve the request body to a string for hashing (only string bodies). Pure. */
function bodyOf(init?: RequestInit): string {
  const b = init?.body;
  return typeof b === "string" ? b : "";
}

function buildResponse(status: number, body: string): Response {
  return new Response(body, { status });
}

/**
 * Build a fetch-shaped function that records or replays through a cassette.
 * The returned fn never throws across the boundary in replay on a miss — it
 * resolves a clear `500` error Response describing the unmatched request.
 */
export function makeVcrFetch(opts: VcrFetchOptions): FetchLike {
  return async function vcrFetch(input, init) {
    if (opts.mode === "off") return opts.realFetch(input, init);

    const method = methodOf(input, init);
    const url = urlOf(input);
    const body = bodyOf(init);
    const recordedReq = toRecordedRequest(method, url, body);

    if (opts.mode === "replay") {
      const hit = findInteraction(opts.cassette, recordedReq);
      if (hit) return buildResponse(hit.status, hit.body);
      return buildResponse(
        500,
        `VCR replay miss: no recorded response for ${method.toUpperCase()} ${url}. ` +
          `Re-run with VANTA_VCR=record to capture it.`,
      );
    }

    // record: hit the real network, capture the pair, persist.
    const res = await opts.realFetch(input, init);
    const text = await res.clone().text();
    opts.cassette.push(...recordInteraction([], recordedReq, { status: res.status, body: text }));
    if (opts.save) await opts.save(opts.cassette);
    return res;
  };
}
