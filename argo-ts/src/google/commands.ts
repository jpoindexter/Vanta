import { runGoogleAuth } from "./auth.js";

/**
 * `argo auth google` — run the one-time interactive OAuth consent flow and
 * persist the refresh token. On missing client credentials (the actionable
 * "set ARGO_GOOGLE_CLIENT_ID/SECRET" error), print the message and exit 1.
 * Returns the intended process exit code; never throws across the boundary.
 */
export async function runAuthCommand(
  provider: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  if (provider !== "google") {
    console.log("Usage: argo auth google");
    return 1;
  }
  try {
    await runGoogleAuth(env);
    console.log(
      "\nGoogle authorized. Argo can now use gmail_*, calendar_*, and drive_* tools.",
    );
    return 0;
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
