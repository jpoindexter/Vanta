import { describe, expect, it, vi } from "vitest";
import type { LinkedInCredential } from "./contract.js";
import {
  createLinkedInTextPost,
  LINKEDIN_API_VERSION,
  LINKEDIN_POSTS_URL,
  LINKEDIN_USERINFO_URL,
  linkedInPostPayload,
  resolveLinkedInPersonUrn,
  type LinkedInPostFetch,
  type LinkedInPostResponse,
} from "./post.js";

const credential: LinkedInCredential = {
  accessToken: "access",
  clientId: "client",
  expiresAt: Date.UTC(2030, 0, 1),
  scopes: ["openid", "profile", "w_member_social"],
  authorization: "member-posting",
  source: "portal-token",
};

function response(input: {
  status: number;
  json?: unknown;
  postId?: string;
}): LinkedInPostResponse {
  return {
    ok: input.status >= 200 && input.status < 300,
    status: input.status,
    headers: { get: (name) => name.toLowerCase() === "x-restli-id" ? input.postId ?? null : null },
    json: async () => input.json ?? {},
  };
}

describe("LinkedIn personal posting provider", () => {
  it("resolves the personal author through OpenID userinfo", async () => {
    const doFetch = vi.fn(async () => response({ status: 200, json: { sub: "member-1", name: "Person" } })) as LinkedInPostFetch;
    await expect(resolveLinkedInPersonUrn(credential, doFetch)).resolves.toBe("urn:li:person:member-1");
    expect(doFetch).toHaveBeenCalledWith(LINKEDIN_USERINFO_URL, expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer access" }),
    }));
  });

  it("rejects an unavailable or malformed identity before posting", async () => {
    const unavailable = vi.fn(async () => response({ status: 401 })) as LinkedInPostFetch;
    await expect(resolveLinkedInPersonUrn(credential, unavailable)).rejects.toThrow("HTTP 401");
    const malformed = vi.fn(async () => response({ status: 200, json: { name: "Person" } })) as LinkedInPostFetch;
    await expect(resolveLinkedInPersonUrn(credential, malformed)).rejects.toThrow("member subject");
  });

  it.each(["PUBLIC", "CONNECTIONS"] as const)("builds the official %s text-post payload", (visibility) => {
    expect(linkedInPostPayload("urn:li:person:member-1", { text: "hello", visibility })).toEqual({
      author: "urn:li:person:member-1",
      commentary: "hello",
      visibility,
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    });
  });

  it("publishes with current REST headers and returns the provider post link", async () => {
    const doFetch = vi.fn(async () => response({
      status: 201,
      postId: "urn:li:share:12345",
    })) as LinkedInPostFetch;
    const result = await createLinkedInTextPost(
      credential,
      "urn:li:person:member-1",
      { text: "hello", visibility: "PUBLIC" },
      doFetch,
    );
    expect(result).toEqual({
      outcome: "confirmed",
      postId: "urn:li:share:12345",
      url: "https://www.linkedin.com/feed/update/urn:li:share:12345/",
    });
    expect(doFetch).toHaveBeenCalledWith(LINKEDIN_POSTS_URL, expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        authorization: "Bearer access",
        "linkedin-version": LINKEDIN_API_VERSION,
        "x-restli-protocol-version": "2.0.0",
      }),
    }));
  });

  it("distinguishes a definitive rejection from an ambiguous acknowledgement", async () => {
    const rejected = vi.fn(async () => response({ status: 403 })) as LinkedInPostFetch;
    await expect(createLinkedInTextPost(
      credential,
      "urn:li:person:member-1",
      { text: "hello", visibility: "PUBLIC" },
      rejected,
    )).resolves.toEqual({ outcome: "rejected", status: 403 });

    const providerFailure = vi.fn(async () => response({ status: 500 })) as LinkedInPostFetch;
    await expect(createLinkedInTextPost(
      credential,
      "urn:li:person:member-1",
      { text: "hello", visibility: "PUBLIC" },
      providerFailure,
    )).resolves.toMatchObject({ outcome: "unknown" });

    const missingId = vi.fn(async () => response({ status: 201 })) as LinkedInPostFetch;
    await expect(createLinkedInTextPost(
      credential,
      "urn:li:person:member-1",
      { text: "hello", visibility: "PUBLIC" },
      missingId,
    )).resolves.toMatchObject({ outcome: "unknown" });
  });
});
