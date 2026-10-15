import { z } from "zod";
import { effectScope } from "../effects/gate-context.js";
import { toolEffectDescriptorSha256 } from "../effects/tool-effect-gateway.js";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { createNativeAppAdapter, NativeBundleId, validateNativeAppIdentity, type NativeAppAdapter } from "./native-app-launch-run.js";

const NAME = "native_app_launch";
const Args = z.object({ bundle_id: NativeBundleId }).strict();
type Deps = { platform?: NodeJS.Platform; adapter?: NativeAppAdapter };

export function nativeAppLaunchAction(raw: Record<string, unknown>): string {
  const parsed = Args.safeParse(raw);
  return parsed.success
    ? `launch native application ${parsed.data.bundle_id} (no documents, arguments, or commands)`
    : "launch native application (invalid bundle identity)";
}

function hasLaunchAuthority(raw: Record<string, unknown>, ctx: ToolContext): boolean {
  const authority = ctx.effectAuthority;
  return Boolean(ctx.effectCallId && authority?.operationId === ctx.effectCallId
    && authority.scopeId === effectScope(ctx)
    && authority.descriptorSha256 === toolEffectDescriptorSha256(NAME, raw, nativeAppLaunchAction(raw)));
}

function denied(output: string): ToolResult {
  return { ok: false, output, effectDisposition: "denied", verification: { status: "unverified" } };
}

async function launch(raw: Record<string, unknown>, ctx: ToolContext, deps: Deps): Promise<ToolResult> {
  const parsed = Args.safeParse(raw);
  if (!parsed.success) return denied("native_app_launch requires only a valid bundle_id; paths, scripts and additional arguments are not accepted.");
  if ((deps.platform ?? process.platform) !== "darwin") return denied("Native application launch is available only on macOS.");
  if (!hasLaunchAuthority(raw, ctx)) return denied("Native application launch requires the existing tool effect gateway's exact authority.");
  const adapter = deps.adapter ?? createNativeAppAdapter();
  let app;
  try {
    const resolved = await adapter.resolve(parsed.data.bundle_id);
    if (!resolved) return denied(`No installed application resolved for ${parsed.data.bundle_id}; no launch requested.`);
    app = validateNativeAppIdentity(resolved, parsed.data.bundle_id);
  } catch {
    return denied("Native application identity lookup failed; no launch requested. Check the exact installed bundle ID before trying again.");
  }
  try {
    await adapter.launch(app);
    return { ok: true, output: `macOS accepted the launch request for ${app.bundleId}. No documents, arguments or commands were supplied.\nVerification: launch accepted; visible app state has not been verified. Observe the app before continuing.`,
      effectDisposition: "confirmed", verification: { status: "unverified", evidence: `macOS launch acknowledgment for ${app.bundleId}` } };
  } catch {
    return { ok: false, output: `Launch outcome for ${app.bundleId} is unknown. Do not retry automatically; inspect the app before any further action.`,
      effectDisposition: "unknown", verification: { status: "unverified" } };
  }
}

export function createNativeAppLaunchTool(deps: Deps = {}): Tool {
  return {
    schema: {
      name: NAME,
      description: "Launch one installed macOS application by its exact bundle ID, for example com.apple.calculator. No shell, documents, scripts, URLs, extra arguments or automatic retries. Uses existing app-control authority. Launch acceptance is not visible-state verification; observe the app before acting on it.",
      parameters: { type: "object", additionalProperties: false,
        properties: { bundle_id: { type: "string", description: "Exact installed application's bundle identifier, not its display name or path" } },
        required: ["bundle_id"] },
    },
    describeForSafety: nativeAppLaunchAction,
    execute: (raw, ctx) => launch(raw, ctx, deps),
  };
}

export const nativeAppLaunchTool = createNativeAppLaunchTool();
