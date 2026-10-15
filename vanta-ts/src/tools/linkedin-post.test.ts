import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LinkedInCredential } from "../linkedin/contract.js";
import type { LinkedInPostFetch, LinkedInPostResponse } from "../linkedin/post.js";
import { executeToolEffect } from "../effects/tool-effect-gateway.js";
import { linkedInPostApproval } from "./linkedin-post.js";
import { linkedinPostTool } from "./linkedin-post.js";
import type { ToolContext } from "./types.js";

const roots: string[] = [];
const body = "Temporary integration test.";
const credential: LinkedInCredential = {
  accessToken: "access",
  clientId: "client",
  expiresAt: Date.UTC(2030, 0, 1),
  scopes: ["openid", "profile", "w_member_social"],
  authorization: "member-posting",
  source: "portal-token",
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function response(status: number, json: unknown = {}, postId?: string): LinkedInPostResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "x-restli-id" ? postId ?? null : null },
    json: async () => json,
  };
}

function sequence(...items: Array<LinkedInPostResponse | Error>): LinkedInPostFetch {
  return vi.fn(async () => {
    const item = items.shift();
    if (item instanceof Error) throw item;
    if (!item) throw new Error("unexpected fetch");
    return item;
  }) as LinkedInPostFetch;
}

function context(overrides: Record<string, unknown> = {}): ToolContext {
  return {
    root: "/tmp/vanta-linkedin-post-test",
    safety: { assess: vi.fn(async () => ({ risk: "allow" as const })) } as unknown as ToolContext["safety"],
    requestApproval: vi.fn(async () => true),
    loadLinkedInCredential: vi.fn(async () => credential),
    now: () => Date.UTC(2029, 0, 1),
    ...overrides,
  } as ToolContext;
}

describe("linkedin_post tool", () => {
  it.each([
    { label: "missing", value: null, now: Date.UTC(2029, 0, 1), issue: "missing or expired" },
    { label: "expired", value: credential, now: Date.UTC(2031, 0, 1), issue: "missing or expired" },
    { label: "scope", value: { ...credential, scopes: ["w_member_social"] }, now: Date.UTC(2029, 0, 1), issue: "openid" },
  ])("stops on a $label credential before approval or network", async ({ value, now, issue }) => {
    const doFetch = vi.fn();
    const ctx = context({
      linkedinFetch: doFetch,
      loadLinkedInCredential: vi.fn(async () => value),
      now: () => now,
    });
    const result = await linkedinPostTool.execute({ text: body }, ctx);
    expect(result).toMatchObject({ ok: false, effectDisposition: "denied" });
    expect(result.output).toContain(issue);
    expect(ctx.requestApproval).not.toHaveBeenCalled();
    expect(doFetch).not.toHaveBeenCalled();
  });

  it("shows exact preview but hashes the safety action, then stops on denial", async () => {
    const doFetch = vi.fn();
    const ctx = context({ linkedinFetch: doFetch, requestApproval: vi.fn(async () => false) });
    const result = await linkedinPostTool.execute({ text: body, visibility: "CONNECTIONS" }, ctx);
    expect(result).toMatchObject({ ok: false, effectDisposition: "denied" });
    const call = (ctx.requestApproval as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toMatch(/CONNECTIONS.*sha256 [a-f0-9]{64}/);
    expect(call?.[0]).not.toContain(body);
    expect(call?.[3]).toMatchObject({ fresh: true, diff: expect.stringContaining(body) });
    expect(doFetch).not.toHaveBeenCalled();
  });

  it("fails closed when identity resolution fails before the post request", async () => {
    const doFetch = sequence(response(401));
    const result = await linkedinPostTool.execute({ text: body }, context({ linkedinFetch: doFetch }));
    expect(result).toMatchObject({ ok: false, effectDisposition: "denied" });
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  it("reports a provider-confirmed post without claiming readback", async () => {
    const doFetch = sequence(
      response(200, { sub: "member-1" }),
      response(201, {}, "urn:li:ugcPost:12345"),
    );
    const result = await linkedinPostTool.execute({ text: body }, context({ linkedinFetch: doFetch }));
    expect(result).toMatchObject({
      ok: true,
      effectDisposition: "confirmed",
      verification: { status: "unverified" },
    });
    expect(result.output).toContain("https://www.linkedin.com/feed/update/urn:li:ugcPost:12345/");
    expect(result.output).not.toContain(body);
  });

  it("reports an ambiguous post failure as unknown and never retries", async () => {
    const doFetch = sequence(response(200, { sub: "member-1" }), new Error("reset"));
    const result = await linkedinPostTool.execute({ text: body }, context({ linkedinFetch: doFetch }));
    expect(result).toMatchObject({ ok: false, effectDisposition: "unknown" });
    expect(result.output).toContain("inspect the profile before any retry");
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("uses the durable effect claim to prevent a duplicate provider call", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-linkedin-effect-"));
    roots.push(root);
    const doFetch = sequence(
      response(200, { sub: "member-1" }),
      response(201, {}, "urn:li:share:12345"),
    );
    const ctx = context({
      root,
      sessionId: "session-1",
      effectCallId: "linkedin-call-1",
      linkedinFetch: doFetch,
    });
    const args = { text: body, visibility: "PUBLIC" };
    const first = await executeToolEffect("linkedin_post", args, linkedinPostTool, ctx);
    const replay = await executeToolEffect("linkedin_post", args, linkedinPostTool, ctx);
    expect(first).toMatchObject({ ok: true, effectDisposition: "confirmed" });
    expect(replay.output).toContain("was already confirmed");
    expect(doFetch).toHaveBeenCalledTimes(2);
    const receipts = await readFile(join(root, ".vanta", "action-receipts.jsonl"), "utf8");
    expect(receipts).not.toContain(body);
    expect(receipts).not.toContain(credential.accessToken);
  });

  it("never places the post body in its safety description", () => {
    const approval = linkedInPostApproval({ text: body, visibility: "PUBLIC" });
    expect(approval.action).not.toContain(body);
    expect(approval.detail).toContain(body);
  });
});
