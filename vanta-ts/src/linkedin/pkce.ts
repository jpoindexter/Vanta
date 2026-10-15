import { createHash, randomBytes } from "node:crypto";

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function challengeForVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: challengeForVerifier(verifier) };
}

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}
