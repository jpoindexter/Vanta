import type http from "node:http";
import type { z } from "zod";
import { readJson, sendJson } from "./handler-http.js";

/** Zod messages as one actionable line: "field: problem; field: problem". */
export function issueText(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

/** Validate a response payload before it leaves the server; a mismatch is a server bug, not a client error. */
export function sendValidated<S extends z.ZodTypeAny>(res: http.ServerResponse, schema: S, payload: unknown): void {
  const parsed = schema.safeParse(payload);
  if (parsed.success) sendJson(res, 200, parsed.data);
  else sendJson(res, 500, { error: `company payload failed validation (${issueText(parsed.error)}). This is a server bug; report it with the route name.` });
}

export function sendFailure(res: http.ServerResponse, status: number, error: string): void {
  sendJson(res, status, { error });
}

/** Parse a JSON request body through a schema. Malformed JSON and bad fields both answer 400. */
export async function parseBody<S extends z.ZodTypeAny>(req: http.IncomingMessage, schema: S): Promise<{ ok: true; value: z.infer<S> } | { ok: false; error: string }> {
  let raw: unknown;
  try {
    raw = await readJson(req);
  } catch {
    return { ok: false, error: "request body must be valid JSON" };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: issueText(parsed.error) };
}

export function parseQuery<S extends z.ZodTypeAny>(url: URL, schema: S): { ok: true; value: z.infer<S> } | { ok: false; error: string } {
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams.entries()));
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: issueText(parsed.error) };
}
