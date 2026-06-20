import { z } from "zod";

/**
 * Pure parsing + guidance for Google's downloaded OAuth client JSON. NO network,
 * NO copy-paste of client_id/secret — the user points us at the file Google gives
 * them. Secrets are returned to the caller (auth flow) but NEVER logged here.
 */

/** Google wraps the credential under "installed" (Desktop) or "web" (Web app). */
const CredsSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
});

const ClientJsonSchema = z
  .object({ installed: CredsSchema.optional(), web: CredsSchema.optional() })
  .refine((o) => o.installed ?? o.web, {
    message: "missing the installed/web credential block",
  });

export interface ClientCreds {
  clientId: string;
  clientSecret: string;
}

export type ParseClientResult =
  | { ok: true; creds: ClientCreds }
  | { ok: false; error: string };

const BAD_JSON =
  'Not valid JSON. Pass the client_secret.json file Google gave you: vanta auth google --client <path>';
const BAD_SHAPE =
  'Unexpected client JSON shape. Re-download the OAuth client (type: Desktop app) from Google Cloud Console — it must have an "installed" or "web" block with client_id + client_secret.';

/**
 * Parse the raw text of a Google client_secret.json into typed creds.
 * Errors-as-values — malformed input never throws across the boundary.
 */
export function parseClientJson(text: string): ParseClientResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: BAD_JSON };
  }
  const parsed = ClientJsonSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: BAD_SHAPE };
  const block = parsed.data.installed ?? parsed.data.web;
  // refine() guarantees one block exists; narrow for the type checker.
  if (!block) return { ok: false, error: BAD_SHAPE };
  return {
    ok: true,
    creds: { clientId: block.client_id, clientSecret: block.client_secret },
  };
}

/** OAuth consent-screen publishing status, best-effort detected. */
export type PublishState = "testing" | "published" | "unknown";

/**
 * Guidance text for the detected publishing state. A Testing-status consent
 * screen expires refresh tokens after 7 days, so we warn + guide the user
 * through Publish App and the unverified-app click-through. Pure — returns the
 * text, never prints. Empty string for "published" (nothing to warn about).
 */
export function publishStateWarning(state: PublishState): string {
  if (state === "published") return "";
  const lead =
    state === "testing"
      ? "⚠ Your OAuth consent screen is in Testing status."
      : "⚠ Could not confirm your OAuth consent screen's publishing status (assuming Testing).";
  return [
    lead,
    "Testing-status refresh tokens EXPIRE after 7 days — auth will silently break ~weekly.",
    "Fix it once: in Google Cloud Console → APIs & Services → OAuth consent screen,",
    'click "Publish App" and confirm (moves you to In production / Testing→Published).',
    'On the consent screen during sign-in, an unverified app shows a warning:',
    'click "Advanced" → "Go to <app> (unsafe)" to continue. This is expected for a',
    "personal app you own; verification is only needed for public distribution.",
  ].join("\n");
}
