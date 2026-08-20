import { z } from "zod";

export const LINKEDIN_AUTHORIZATION_URL =
  "https://www.linkedin.com/oauth/native-pkce/authorization";
export const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const LINKEDIN_REDIRECT_URI = "http://127.0.0.1:8765/linkedin/callback";
export const LINKEDIN_SCOPES = ["w_member_social"] as const;

export const LinkedInTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

export const LinkedInCredentialSchema = z.object({
  accessToken: z.string().min(1),
  clientId: z.string().min(1),
  expiresAt: z.number().int().positive(),
  scopes: z.array(z.string().min(1)),
  authorization: z.literal("member-posting").default("member-posting"),
});

export type LinkedInTokenResponse = z.infer<typeof LinkedInTokenResponseSchema>;
export type LinkedInCredential = z.infer<typeof LinkedInCredentialSchema>;

export interface LinkedInAuthorization {
  expiresAt: number;
  scopes: string[];
}

export type LinkedInFetch = (
  url: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;
