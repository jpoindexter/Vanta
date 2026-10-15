import type http from "node:http";
import { z } from "zod";
import { applyContinuityAction, captureContinuityItem, loadContinuitySnapshot } from "../continuity/store.js";
import { loadNdProfile, saveNdSupport } from "../nd/profile.js";
import type { DesktopState } from "./handlers.js";
import { readJson, sendJson } from "./handlers.js";

const RequestSchema = z.object({
  action: z.enum(["capture", "show_me", "do_it", "snooze", "skip", "off"]),
  id: z.string().min(1).optional(),
  text: z.string().optional(),
  sourcePath: z.string().optional(),
  capacity: z.record(z.string(), z.string()).optional(),
  until: z.string().optional(),
  scope: z.enum(["session", "pattern", "global"]).optional(),
});

function stateOptions(state: DesktopState) {
  return { env: state._env ?? process.env, sessionOff: state._continuitySessionOff === true };
}

async function turnOff(state: DesktopState, scope: "session" | "pattern" | "global") {
  if (scope === "session") state._continuitySessionOff = true;
  else {
    const env = state._env ?? process.env;
    const profile = await loadNdProfile(env);
    const patterns = scope === "pattern"
      ? [...new Set([...profile.support.refusals.patterns, "today-recommendation"])]
      : profile.support.refusals.patterns;
    await saveNdSupport({
      ...profile.support,
      refusals: { global: scope === "global" ? true : profile.support.refusals.global, patterns },
    }, env);
  }
  return loadContinuitySnapshot(state.root, { ...stateOptions(state), refusalScope: scope });
}

async function mutate(state: DesktopState, body: z.infer<typeof RequestSchema>) {
  const options = stateOptions(state);
  if (body.action === "off") return { status: 200, body: await turnOff(state, body.scope ?? "session") };
  const current = await loadContinuitySnapshot(state.root, options);
  if (body.action === "capture") {
    if (current.support.refusal.active) throw new RefusalError(`continuity support is off for ${current.support.refusal.scope}`);
    return {
      status: 201,
      body: await captureContinuityItem(state.root, {
        text: body.text,
        sourcePath: body.sourcePath,
        capacity: body.capacity,
      }, options),
    };
  }
  if (!body.id) throw new Error(`${body.action} needs id`);
  const action = body.action === "snooze"
    ? { action: body.action, until: body.until }
    : { action: body.action };
  return { status: 200, body: await applyContinuityAction(state.root, body.id, action, options) };
}

class RefusalError extends Error {}

export async function handleDesktopContinuity(
  state: DesktopState,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (req.method === "GET") {
    sendJson(res, 200, await loadContinuitySnapshot(state.root, stateOptions(state)));
    return;
  }
  try {
    const parsed = RequestSchema.parse(await readJson(req));
    const result = await mutate(state, parsed);
    sendJson(res, result.status, result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, error instanceof RefusalError ? 409 : 400, { error: message });
  }
}
