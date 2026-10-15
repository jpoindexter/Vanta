import { z } from "zod";
import type { LinkedInCredential } from "./contract.js";

export const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
export const LINKEDIN_POSTS_URL = "https://api.linkedin.com/rest/posts";
export const LINKEDIN_API_VERSION = "202606";

export const LinkedInPostArgsSchema = z.object({
  text: z.string().min(1).max(3_000).refine((value) => value.trim().length > 0),
  visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC"),
});

export type LinkedInPostArgs = z.infer<typeof LinkedInPostArgsSchema>;

export type LinkedInPostResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
};

export type LinkedInPostFetch = (
  url: string,
  init?: RequestInit,
) => Promise<LinkedInPostResponse>;

export type LinkedInPostResult =
  | { outcome: "confirmed"; postId: string; url: string }
  | { outcome: "rejected"; status: number }
  | { outcome: "unknown"; reason: string };

const ProfileSchema = z.object({ sub: z.string().min(1) });
const POST_ID = /^urn:li:(?:share|ugcPost):[A-Za-z0-9_-]+$/;

function bearer(credential: LinkedInCredential): Record<string, string> {
  return { authorization: `Bearer ${credential.accessToken}` };
}

export async function resolveLinkedInPersonUrn(
  credential: LinkedInCredential,
  doFetch: LinkedInPostFetch,
): Promise<string> {
  const response = await doFetch(LINKEDIN_USERINFO_URL, {
    headers: { ...bearer(credential), accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`LinkedIn identity lookup failed with HTTP ${response.status}.`);
  }
  const profile = ProfileSchema.safeParse(await response.json());
  if (!profile.success) throw new Error("LinkedIn identity response did not include a member subject.");
  return `urn:li:person:${profile.data.sub}`;
}

export function linkedInPostPayload(author: string, input: LinkedInPostArgs): Record<string, unknown> {
  return {
    author,
    commentary: input.text,
    visibility: input.visibility,
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
}

export async function createLinkedInTextPost(
  credential: LinkedInCredential,
  author: string,
  input: LinkedInPostArgs,
  doFetch: LinkedInPostFetch,
): Promise<LinkedInPostResult> {
  const response = await doFetch(LINKEDIN_POSTS_URL, {
    method: "POST",
    headers: {
      ...bearer(credential),
      accept: "application/json",
      "content-type": "application/json",
      "linkedin-version": LINKEDIN_API_VERSION,
      "x-restli-protocol-version": "2.0.0",
    },
    body: JSON.stringify(linkedInPostPayload(author, input)),
  });
  if (!response.ok) {
    return response.status >= 400 && response.status < 500
      ? { outcome: "rejected", status: response.status }
      : { outcome: "unknown", reason: `ambiguous HTTP ${response.status}` };
  }
  if (response.status !== 201) {
    return { outcome: "unknown", reason: `unexpected HTTP ${response.status}` };
  }
  const postId = response.headers.get("x-restli-id")?.trim();
  if (!postId || !POST_ID.test(postId)) {
    return { outcome: "unknown", reason: "LinkedIn accepted the request without a valid post ID" };
  }
  return {
    outcome: "confirmed",
    postId,
    url: `https://www.linkedin.com/feed/update/${postId}/`,
  };
}
