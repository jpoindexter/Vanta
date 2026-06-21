/**
 * AWS Bedrock provider — config resolution + friendly→Bedrock model-id mapping.
 *
 * PURE config/catalog slice only. The LIVE runtime call is the documented
 * boundary, NOT built here: a `case "bedrock"` in {@link ../providers/index.ts}
 * `resolveProvider` would construct a `BedrockProvider` that signs each request
 * with AWS SigV4 via `@aws-sdk/client-bedrock-runtime` (the dep + adapter). Unlike
 * the OpenAI-compatible backends, Bedrock is NOT a baseURL swap — SigV4 request
 * signing is a real adapter, so the wire is deferred (no AWS SDK dep this round).
 *
 * SECURITY: AWS credentials are secrets. {@link resolveBedrockConfig} reports only
 * their PRESENCE (never the value); no credential literal appears in this file.
 */
import { z } from "zod";
import type { ProviderEntry } from "./catalog.js";

/**
 * Friendly model name → on-Bedrock model id. The ids use the real Bedrock
 * `<provider>.<model>:<version>` foundation-model-id format (the on-Bedrock
 * shape, NOT a Vanta invention).
 */
export const BEDROCK_MODEL_MAP: Record<string, string> = {
  "claude-sonnet": "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "claude-haiku": "anthropic.claude-3-5-haiku-20241022-v1:0",
  "claude-opus": "anthropic.claude-3-opus-20240229-v1:0",
  "llama-3": "meta.llama3-1-70b-instruct-v1:0",
  "titan-text": "amazon.titan-text-premier-v1:0",
};

/** The default Bedrock model when none is configured / an unknown name is given. */
export const DEFAULT_BEDROCK_MODEL_ID = "anthropic.claude-3-5-sonnet-20241022-v2:0";

/**
 * Resolve a friendly name OR an already-Bedrock id to a Bedrock model id.
 *   - a known friendly name → its mapped id
 *   - an already-Bedrock id (contains a ".") → passthrough unchanged
 *   - anything else (unknown) → the default id
 */
export function resolveBedrockModelId(friendlyOrId: string): string {
  const mapped = BEDROCK_MODEL_MAP[friendlyOrId];
  if (mapped) return mapped;
  if (friendlyOrId.includes(".")) return friendlyOrId;
  return DEFAULT_BEDROCK_MODEL_ID;
}

/** Resolved, validated Bedrock config (region + model id). Carries no secrets. */
export const BedrockConfigSchema = z.object({
  region: z.string().min(1),
  modelId: z.string().min(1),
});
export type BedrockConfig = z.infer<typeof BedrockConfigSchema>;

/** Errors-as-values result of {@link resolveBedrockConfig}. */
export type BedrockConfigResult =
  | { ok: true; config: BedrockConfig }
  | { ok: false; missing: string[] };

/**
 * True when AWS credentials are PRESENT in the environment — either a static
 * key pair (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`) OR a named profile
 * (`AWS_PROFILE`). Presence only; the values are never read out.
 */
function hasCredentials(env: NodeJS.ProcessEnv): boolean {
  const hasKeyPair = Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
  const hasProfile = Boolean(env.AWS_PROFILE);
  return hasKeyPair || hasProfile;
}

/**
 * Resolve Bedrock config from the environment. Returns the validated config when
 * region + model + credential-presence are all satisfied, else the list of what's
 * missing (`"region"`, `"model"`, `"credentials"`) — incomplete config is a clear
 * value, never a crash.
 *   - region: `AWS_REGION` or `VANTA_BEDROCK_REGION`
 *   - model:  `VANTA_BEDROCK_MODEL` via {@link resolveBedrockModelId}
 *   - creds:  presence of a key pair OR `AWS_PROFILE` (value never reported)
 */
export function resolveBedrockConfig(env: NodeJS.ProcessEnv): BedrockConfigResult {
  const missing: string[] = [];

  const region = env.AWS_REGION ?? env.VANTA_BEDROCK_REGION;
  if (!region) missing.push("region");

  const modelRaw = env.VANTA_BEDROCK_MODEL;
  if (!modelRaw) missing.push("model");

  if (!hasCredentials(env)) missing.push("credentials");

  if (missing.length > 0) return { ok: false, missing };

  // region + modelRaw are defined here (their absence pushed to `missing` above).
  const config = BedrockConfigSchema.parse({
    region,
    modelId: resolveBedrockModelId(modelRaw as string),
  });
  return { ok: true, config };
}

/**
 * The PROVIDER_CATALOG entry the setup wizard + `doctor` read. Matches the
 * {@link ProviderEntry} shape; `envVar` is the credential the wizard surfaces
 * (`AWS_ACCESS_KEY_ID`), and `defaultModel` is a friendly name the map resolves.
 */
export const BEDROCK_CATALOG_ENTRY: ProviderEntry = {
  id: "bedrock",
  label: "AWS Bedrock (Claude, Llama, Titan via AWS)",
  short: "Bedrock",
  envVar: "AWS_ACCESS_KEY_ID",
  defaultModel: "claude-sonnet",
  models: Object.keys(BEDROCK_MODEL_MAP),
  signupUrl: "https://console.aws.amazon.com/bedrock",
  note: "needs AWS creds (key pair or AWS_PROFILE) + VANTA_BEDROCK_REGION; SigV4 runtime not built yet",
};
