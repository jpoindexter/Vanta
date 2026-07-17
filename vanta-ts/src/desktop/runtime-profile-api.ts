import type http from "node:http";
import { totalmem } from "node:os";
import { runtimeProfileLaunchContract, type CreateRuntimeProfileInput, type RuntimeProfileHost } from "../runtime-engine/profile-contract.js";
import {
  cloneRuntimeProfile,
  createStoredRuntimeProfile,
  exportRuntimeProfile,
  importRuntimeProfile,
  listRuntimeProfiles,
  readRuntimeProfile,
  readSelectedRuntimeProfile,
  selectRuntimeProfile,
} from "../runtime-engine/profile-store.js";
import { readJson, sendJson, type DesktopState } from "./handlers.js";

export type DesktopRuntimeProfilePayload = Awaited<ReturnType<typeof runtimeProfilePayload>>;

function detectedHost(): RuntimeProfileHost {
  return { platform: process.platform, architecture: process.arch, memoryBytes: totalmem() };
}

export async function runtimeProfilePayload(root: string, host = detectedHost()) {
  const [profiles, selected] = await Promise.all([listRuntimeProfiles(root), readSelectedRuntimeProfile(root)]);
  return {
    selectedId: selected?.id ?? null,
    host,
    profiles: profiles.map((profile) => {
      const contract = runtimeProfileLaunchContract(profile, host);
      return { profile, validation: contract.validation, preview: contract.preview, roundTrip: contract.roundTrip };
    }),
  };
}

type RuntimeProfileAction =
  | { action: "create"; input: CreateRuntimeProfileInput }
  | { action: "clone"; id: string; newId: string; name: string }
  | { action: "select"; id: string }
  | { action: "import"; profile: unknown; replace?: boolean }
  | { action: "export"; id: string };

async function applyAction(root: string, body: RuntimeProfileAction, host: RuntimeProfileHost): Promise<{ export?: string }> {
  if (body.action === "create") await createStoredRuntimeProfile(root, body.input);
  if (body.action === "clone") await cloneRuntimeProfile(root, { sourceId: body.id, id: body.newId, name: body.name });
  if (body.action === "import") await importRuntimeProfile(root, body.profile, body.replace);
  if (body.action === "export") return { export: await exportRuntimeProfile(root, body.id) };
  if (body.action === "select") {
    const profile = await readRuntimeProfile(root, body.id);
    const validation = runtimeProfileLaunchContract(profile, host).validation;
    if (!validation.valid) throw Object.assign(new Error(validation.issues[0]?.recovery ?? "Profile is not valid on this host."), { status: 409, issues: validation.issues });
    await selectRuntimeProfile(root, body.id);
  }
  return {};
}

export async function handleRuntimeProfiles(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse, host = detectedHost()): Promise<void> {
  if (req.method === "GET") return sendJson(res, 200, await runtimeProfilePayload(state.root, host));
  try {
    const body = await readJson(req) as RuntimeProfileAction;
    if (!body || typeof body.action !== "string") return sendJson(res, 400, { error: "runtime profile action is required" });
    const result = await applyAction(state.root, body, host);
    sendJson(res, 200, { ...(result.export ? { export: result.export } : {}), ...(await runtimeProfilePayload(state.root, host)) });
  } catch (error) {
    const failure = error as Error & { status?: number; issues?: unknown };
    sendJson(res, failure.status ?? 400, { error: failure.message, ...(failure.issues ? { issues: failure.issues } : {}) });
  }
}
