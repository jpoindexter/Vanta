import { createHash } from "node:crypto";
import type { LinkedInCredential } from "../linkedin/contract.js";
import { loadLinkedInCredential } from "../linkedin/store.js";
import {
  createLinkedInTextPost,
  LinkedInPostArgsSchema,
  resolveLinkedInPersonUrn,
  type LinkedInPostArgs,
  type LinkedInPostFetch,
} from "../linkedin/post.js";
import type { Tool, ToolContext, ToolResult } from "./types.js";

type LinkedInPostContext = ToolContext & {
  linkedinFetch?: LinkedInPostFetch;
  loadLinkedInCredential?: (env: NodeJS.ProcessEnv) => Promise<LinkedInCredential | null>;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
};

const REQUIRED_SCOPES = ["openid", "profile", "w_member_social"] as const;

function postDigest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function linkedInPostApproval(input: LinkedInPostArgs): {
  action: string;
  detail: string;
} {
  const bytes = Buffer.byteLength(input.text, "utf8");
  return {
    action: `publish ${input.visibility} personal LinkedIn post (${bytes} bytes, sha256 ${postDigest(input.text)})`,
    detail: `LinkedIn ${input.visibility} post preview:\n${input.text}`,
  };
}

function missingPostingScope(credential: LinkedInCredential): string | undefined {
  return REQUIRED_SCOPES.find((scope) => !credential.scopes.includes(scope));
}

async function postingCredential(ctx: LinkedInPostContext): Promise<LinkedInCredential> {
  const env = ctx.env ?? process.env;
  const credential = await (ctx.loadLinkedInCredential ?? loadLinkedInCredential)(env);
  if (!credential || credential.expiresAt <= (ctx.now?.() ?? Date.now())) {
    throw new Error("LinkedIn OAuth token is missing or expired. Run: vanta auth linkedin import");
  }
  const missing = missingPostingScope(credential);
  if (missing) throw new Error(`LinkedIn OAuth token is missing required scope: ${missing}`);
  return credential;
}

async function publish(input: LinkedInPostArgs, ctx: LinkedInPostContext): Promise<ToolResult> {
  let credential: LinkedInCredential;
  try {
    credential = await postingCredential(ctx);
  } catch (error) {
    return { ok: false, output: (error as Error).message, effectDisposition: "denied" };
  }
  const approval = linkedInPostApproval(input);
  const approved = await ctx.requestApproval(
    approval.action,
    "publishes once to the connected personal LinkedIn profile",
    "linkedin_post",
    { fresh: true, diff: approval.detail },
  );
  if (!approved) return { ok: false, output: "LinkedIn post denied by user", effectDisposition: "denied" };

  const doFetch = ctx.linkedinFetch ?? (globalThis.fetch as LinkedInPostFetch);
  let author: string;
  try {
    author = await resolveLinkedInPersonUrn(credential, doFetch);
  } catch (error) {
    return { ok: false, output: (error as Error).message, effectDisposition: "denied" };
  }
  try {
    const result = await createLinkedInTextPost(credential, author, input, doFetch);
    if (result.outcome === "rejected") {
      return { ok: false, output: `LinkedIn rejected the post with HTTP ${result.status}; nothing was published`, effectDisposition: "denied" };
    }
    if (result.outcome === "unknown") {
      return { ok: false, output: `${result.reason}; do not retry automatically`, effectDisposition: "unknown" };
    }
    return {
      ok: true,
      output: `LinkedIn accepted the post.\nPost ID: ${result.postId}\nPost URL: ${result.url}\nVerification: provider-confirmed; browser readback not run.`,
      effectDisposition: "confirmed",
      verification: { status: "unverified", evidence: `LinkedIn post ${result.postId}` },
    };
  } catch {
    return {
      ok: false,
      output: "LinkedIn post result is unknown after a network failure; inspect the profile before any retry",
      effectDisposition: "unknown",
      verification: { status: "unverified" },
    };
  }
}

export const linkedinPostTool: Tool = {
  schema: {
    name: "linkedin_post",
    description: "Publish one text-only post to the connected personal LinkedIn profile. Always requires fresh approval and never retries automatically.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Exact post text, 1-3000 characters" },
        visibility: { type: "string", enum: ["PUBLIC", "CONNECTIONS"], description: "Post audience; defaults to PUBLIC" },
      },
      required: ["text"],
    },
  },
  describeForSafety: (raw) => linkedInPostApproval({
    text: typeof raw.text === "string" ? raw.text : "",
    visibility: raw.visibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC",
  }).action,
  async execute(raw, ctx) {
    const parsed = LinkedInPostArgsSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "linkedin_post needs nonblank text up to 3000 characters and optional PUBLIC or CONNECTIONS visibility" };
    return publish(parsed.data, ctx as LinkedInPostContext);
  },
};
