import { z } from "zod";

// Serverless execution backend: where shell_cmd / run_code run on a hibernate-
// when-idle cloud sandbox (Modal or Daytona) that persists without paying for
// idle compute. Config resolution + argv construction stay pure here; the
// concrete CLI probe/wrapper lives in exec/adapters/serverless.ts. There is no
// Modal/Daytona SDK dependency. The kernel assess() gate stays upstream of
// wrapExec: an adapter changes WHERE a command runs, never WHETHER it is allowed.
// Missing/invalid config or an unavailable CLI returns a typed unavailable
// result and the resolver refuses rather than silently changing location.

export type ServerlessProvider = "modal" | "daytona";

const DEFAULT_IDLE_TIMEOUT_SEC = 300;

/** The CLI binary per provider — the live boundary wrapExec would invoke. */
export const SERVERLESS_CLI: Record<ServerlessProvider, string> = {
  modal: "modal",
  daytona: "daytona",
};

export const ServerlessConfigSchema = z.object({
  provider: z.enum(["modal", "daytona"]),
  app: z.string().min(1).optional(),
  image: z.string().min(1).optional(),
  idleTimeoutSec: z.number().int().positive().optional(),
  network: z.boolean().optional(),
});

export type ServerlessConfig = z.infer<typeof ServerlessConfigSchema>;

export type ResolveResult =
  | { ok: true; config: ServerlessConfig }
  | { ok: false; reason: string };

/** True when the env selects the serverless backend AND a provider is configured. */
export function serverlessBackendEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.VANTA_EXEC_BACKEND !== "serverless") return false;
  return resolveServerlessConfig(env).ok;
}

/**
 * Resolve serverless config from the env, errors-as-values. The provider comes
 * from VANTA_SERVERLESS_PROVIDER; app/image/idle from their own vars. No
 * provider (or an unknown one) → {ok:false, reason} so the caller falls back.
 */
export function resolveServerlessConfig(env: NodeJS.ProcessEnv): ResolveResult {
  const provider = env.VANTA_SERVERLESS_PROVIDER;
  if (!provider) {
    return { ok: false, reason: "VANTA_SERVERLESS_PROVIDER not set (modal|daytona)" };
  }
  const idleRaw = env.VANTA_SERVERLESS_IDLE_SEC;
  const parsed = ServerlessConfigSchema.safeParse({
    provider,
    app: env.VANTA_SERVERLESS_APP || undefined,
    image: env.VANTA_SERVERLESS_IMAGE || undefined,
    idleTimeoutSec: idleRaw ? Number(idleRaw) : undefined,
    network: env.VANTA_SERVERLESS_NET === "1",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue ? `${issue.path.join(".")} ${issue.message}` : "unknown field";
    return { ok: false, reason: `serverless config invalid: ${where}` };
  }
  return { ok: true, config: parsed.data };
}

/** Modal argv: `modal run [<app>] [--timeout N] -- <baseCmd...>`. Pure. */
function buildModalArgs(baseCmd: string[], config: ServerlessConfig): string[] {
  const args = ["run"];
  if (config.app) args.push(config.app);
  args.push("--timeout", String(config.idleTimeoutSec ?? DEFAULT_IDLE_TIMEOUT_SEC));
  if (config.image) args.push("--image", config.image);
  args.push("--", ...baseCmd);
  return args;
}

/** Daytona argv: `daytona exec [<app>] [--image I] [--idle N] [--no-network] -- <baseCmd...>`. Pure. */
function buildDaytonaArgs(baseCmd: string[], config: ServerlessConfig): string[] {
  const args = ["exec"];
  if (config.app) args.push(config.app);
  if (config.image) args.push("--image", config.image);
  args.push("--idle", String(config.idleTimeoutSec ?? DEFAULT_IDLE_TIMEOUT_SEC));
  if (config.network === false) args.push("--no-network");
  args.push("--", ...baseCmd);
  return args;
}

/**
 * Build the argv to run `baseCmd` on the serverless backend. Returns a discrete
 * argv ARRAY (never a shell string) — every baseCmd token is preserved as one
 * item, so an injection-shaped token cannot break out via shell interpolation.
 * The provider CLI is prepended by the caller (wrapExec returns {cmd, args}).
 */
export function buildServerlessArgs(baseCmd: string[], config: ServerlessConfig): string[] {
  return config.provider === "modal"
    ? buildModalArgs(baseCmd, config)
    : buildDaytonaArgs(baseCmd, config);
}

export type HibernatePolicy = { idleTimeoutSec: number; hibernates: boolean };

/**
 * The idle→hibernate policy. A positive idle timeout means the sandbox sleeps
 * after that many idle seconds (so no idle compute is paid for) and resumes on
 * the next call; default 300s when unset. A non-positive timeout disables it.
 */
export function hibernatePolicy(config: ServerlessConfig): HibernatePolicy {
  const idleTimeoutSec = config.idleTimeoutSec ?? DEFAULT_IDLE_TIMEOUT_SEC;
  return { idleTimeoutSec, hibernates: idleTimeoutSec > 0 };
}
