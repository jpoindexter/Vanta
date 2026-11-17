import type http from "node:http";
import { z } from "zod";
import { AUTH_STATES, DetectResultSchema } from "../worker-runtimes/types.js";
import { adapterForRuntime } from "../worker-runtimes/adapter-id.js";
import { NATIVE_RUNTIME_ID } from "../worker-runtimes/constants.js";
import { sendValidated } from "./company-http.js";
import { companyPorts } from "./company-ports.js";
import { desktopRegistry } from "./company-run-select.js";
import type { DesktopState } from "./handler-state.js";

// GET /api/company/runtimes: which worker runtimes this machine can run, for the
// hire dialog. Detection runs each CLI's own `--version` and login-status command
// (exit code only), so this route does NOT take the company lock.

export const RuntimesResponseSchema = z.object({
  runtimes: z.array(DetectResultSchema.extend({
    displayName: z.string(),
    /** Value for `adapter` when hiring: "cli:<id>", or null for the Vanta loop (which takes a provider id instead). */
    adapter: z.string().nullable(),
    auth: z.enum(AUTH_STATES),
  })),
});

export async function handleRuntimesRead(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const env = state._env ?? process.env;
  const registry = await desktopRegistry(state, companyPorts().runtimeSeams);
  const details = await registry.detectAll({ env });
  const runtimes = details.map((detail) => ({
    ...detail,
    displayName: registry.get(detail.runtimeId)?.displayName ?? detail.runtimeId,
    adapter: detail.runtimeId === NATIVE_RUNTIME_ID ? null : adapterForRuntime(detail.runtimeId),
  }));
  sendValidated(res, RuntimesResponseSchema, { runtimes });
}
