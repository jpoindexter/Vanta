import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadGrants, saveGrants, secretsForScope, filterInjectable, isSecretInScope, grantSecret, grantCoversScope,
  type SecretGrant,
} from "./scope.js";

// PCLIP-SCOPED-SECRETS — a secret reaches a run only when scoped to it.

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-secret-scope-"));
});
const env = (): NodeJS.ProcessEnv => ({ VANTA_HOME: home });

const GRANTS: SecretGrant[] = [
  { name: "DEPLOY_TOKEN", scopes: ["loop:release"] },
  { name: "OPENAI_API_KEY", scopes: ["*"] }, // instance-wide
  { name: "STRIPE_KEY", scopes: ["agent:billing", "session"] },
];

describe("scoping isolation", () => {
  it("a run resolves ONLY its scoped secrets — a secret scoped elsewhere is withheld", () => {
    // The release loop sees its deploy token + the instance-wide key, NOT Stripe.
    expect(secretsForScope(GRANTS, "loop:release")).toEqual(new Set(["DEPLOY_TOKEN", "OPENAI_API_KEY"]));
    // A different run never sees the deploy token.
    expect(secretsForScope(GRANTS, "loop:other")).toEqual(new Set(["OPENAI_API_KEY"]));
    expect(isSecretInScope(GRANTS, "DEPLOY_TOKEN", "loop:other")).toBe(false);
    expect(isSecretInScope(GRANTS, "DEPLOY_TOKEN", "loop:release")).toBe(true);
  });

  it("an instance-wide (*) grant reaches every scope", () => {
    expect(grantCoversScope({ name: "K", scopes: ["*"] }, "anything")).toBe(true);
    expect(isSecretInScope(GRANTS, "OPENAI_API_KEY", "agent:random")).toBe(true);
  });

  it("filterInjectable offers a run only its granted names from a candidate set", () => {
    const candidates = ["DEPLOY_TOKEN", "OPENAI_API_KEY", "STRIPE_KEY"];
    expect(filterInjectable(candidates, GRANTS, "agent:billing")).toEqual(["OPENAI_API_KEY", "STRIPE_KEY"]);
    expect(filterInjectable(candidates, GRANTS, "loop:release")).toEqual(["DEPLOY_TOKEN", "OPENAI_API_KEY"]);
    // A scope with no matching grant gets nothing.
    expect(filterInjectable(candidates, GRANTS, "agent:nobody")).toEqual(["OPENAI_API_KEY"]);
  });
});

describe("grantSecret", () => {
  it("adds a new grant and merges a scope into an existing one", () => {
    let g = grantSecret([], "TOK", "session");
    expect(g).toEqual([{ name: "TOK", scopes: ["session"] }]);
    g = grantSecret(g, "TOK", "loop:x");
    expect(g[0]?.scopes).toEqual(["session", "loop:x"]);
    // Re-granting the same scope is a no-op (no duplicate).
    expect(grantSecret(g, "TOK", "session")[0]?.scopes).toEqual(["session", "loop:x"]);
  });
});

describe("store", () => {
  it("round-trips grants; a missing/corrupt store fails CLOSED (no grants)", async () => {
    expect(await loadGrants(env())).toEqual([]); // missing → nothing exposed
    await saveGrants(GRANTS, env());
    expect(await loadGrants(env())).toEqual(GRANTS);
    const { writeFile } = await import("node:fs/promises");
    const { scopesPath } = await import("./scope.js");
    await writeFile(scopesPath(env()), "{broken", "utf8");
    expect(await loadGrants(env())).toEqual([]); // corrupt → fail closed
  });
});
