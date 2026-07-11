import { describe, it, expect } from "vitest";
import { buildEnvHandler } from "./env-cmd.js";
import { SessionEnvStore } from "./session-env.js";
import type { ReplCtx } from "./types.js";

// The handler only reads `arg`; ctx is unused, so a bare cast is enough.
const ctx = {} as ReplCtx;

describe("/env handler", () => {
  it("lists an empty store with guidance", async () => {
    const handler = buildEnvHandler(new SessionEnvStore());
    const r = await handler("", ctx);
    expect(r.output).toContain("no session env vars");
  });

  it("sets a var and reports it", async () => {
    const store = new SessionEnvStore();
    const handler = buildEnvHandler(store);
    const r = await handler("API_KEY=abc", ctx);
    expect(r.output).toContain("set API_KEY");
    expect(store.snapshot()).toEqual({ API_KEY: "abc" });
  });

  it("lists set vars (sorted)", async () => {
    const store = new SessionEnvStore();
    const handler = buildEnvHandler(store);
    await handler("ZED=1", ctx);
    await handler("ALPHA=2", ctx);
    const r = await handler("", ctx);
    expect(r.output).toContain("2 session env var(s)");
    const alphaPos = r.output!.indexOf("ALPHA");
    const zedPos = r.output!.indexOf("ZED");
    expect(alphaPos).toBeGreaterThan(-1);
    expect(alphaPos).toBeLessThan(zedPos); // sorted
  });

  it("does not print the value on set but stores it (no echo in the confirmation)", async () => {
    const store = new SessionEnvStore();
    const handler = buildEnvHandler(store);
    const r = await handler("SECRET=s3cr3t", ctx);
    expect(r.output).not.toContain("s3cr3t");
    expect(store.snapshot()).toEqual({ SECRET: "s3cr3t" });
  });

  it("redacts opaque credential values when listing session env", async () => {
    const store = new SessionEnvStore();
    const handler = buildEnvHandler(store);
    await handler("API_KEY=s3cr3t", ctx);
    await handler("DATABASE_URL=postgres://user:pass@db/prod", ctx);
    const r = await handler("", ctx);

    expect(r.output).toContain("API_KEY");
    expect(r.output).toContain("[REDACTED]");
    expect(r.output).not.toContain("s3cr3t");
    expect(r.output).not.toContain("user:pass");
  });

  it("unsets an existing var", async () => {
    const store = new SessionEnvStore();
    const handler = buildEnvHandler(store);
    await handler("FOO=bar", ctx);
    const r = await handler("-FOO", ctx);
    expect(r.output).toContain("unset FOO");
    expect(store.size).toBe(0);
  });

  it("reports a no-op when unsetting a missing var", async () => {
    const handler = buildEnvHandler(new SessionEnvStore());
    const r = await handler("-NOPE", ctx);
    expect(r.output).toContain("no session env var");
  });

  it("surfaces a parse error for a malformed argument", async () => {
    const handler = buildEnvHandler(new SessionEnvStore());
    const r = await handler("NOTANASSIGNMENT", ctx);
    expect(r.output).toContain("expected KEY=value");
  });

  it("surfaces a parse error for an invalid key", async () => {
    const handler = buildEnvHandler(new SessionEnvStore());
    const r = await handler("1BAD=x", ctx);
    expect(r.output).toContain("invalid env var name");
  });

  it("each handler instance gets its own store (no cross-talk)", async () => {
    const a = buildEnvHandler(new SessionEnvStore());
    const b = buildEnvHandler(new SessionEnvStore());
    await a("X=1", ctx);
    const r = await b("", ctx);
    expect(r.output).toContain("no session env vars");
  });
});
