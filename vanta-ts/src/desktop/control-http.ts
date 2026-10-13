import type http from "node:http";
import { z } from "zod";
import { readJson, sendJson } from "./handler-http.js";
import { requestWebApproval } from "./approval.js";
import type { DesktopState } from "./handler-state.js";

export type ControlCtx = {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  state: DesktopState;
  pathname: string;
  /** Captured groups of the matched path pattern, URL-decoded; empty for exact routes. */
  params: string[];
};
export type ControlHandler = (ctx: ControlCtx) => Promise<void>;
export type ControlTable = Record<string, ControlHandler>;
export type ControlPattern = [path: RegExp, handler: ControlHandler];

export function sendFail(res: http.ServerResponse, status: number, error: string): void {
  sendJson(res, status, { error });
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parses the JSON body with Zod; answers 400 itself and returns null on any problem. */
export async function parseBody<S extends z.ZodType>(ctx: ControlCtx, schema: S): Promise<z.infer<S> | null> {
  let raw: unknown;
  try { raw = await readJson(ctx.req); } catch { sendFail(ctx.res, 400, "request body must be valid JSON"); return null; }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  sendFail(ctx.res, 400, `${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}`);
  return null;
}

/** Parses the query string with Zod; answers 400 itself and returns null on any problem. */
export function parseQuery<S extends z.ZodType>(ctx: ControlCtx, schema: S): z.infer<S> | null {
  const url = new URL(ctx.req.url ?? "/", "http://127.0.0.1");
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  sendFail(ctx.res, 400, `${issue?.path.join(".") || "query"}: ${issue?.message ?? "invalid"}`);
  return null;
}

export type ExactAction = { action: string; reason: string; toolName: string };

/**
 * Asks the human to approve one exact action through the same card chat uses. The decision is
 * one-time (`fresh`): a saved "always" rule can never stand in for it. Answers 403 and returns
 * false when the action is denied or another approval is already waiting.
 */
export async function approveExactAction(ctx: ControlCtx, spec: ExactAction): Promise<boolean> {
  const approved = await requestWebApproval(ctx.state, spec.action, spec.reason, { toolName: spec.toolName, detail: { fresh: true, canRemember: false } });
  if (!approved) sendFail(ctx.res, 403, "approval denied or another approval is already waiting");
  return approved;
}

export function sendOk(res: http.ServerResponse, body: Record<string, unknown> = {}): void {
  sendJson(res, 200, { ok: true, ...body });
}
