import { describe, expect, it, vi } from "vitest";
import type { LinkedInCredential } from "../linkedin/contract.js";
import type { LinkedInPostFetch } from "../linkedin/post.js";
import { linkedinPostTool } from "./linkedin-post.js";
import type { ToolContext } from "./types.js";

function fixture(overrides: Record<string, unknown> = {}) {
  const state = { credential: { accessToken: "private-token", clientId: "client-a", expiresAt: Date.UTC(2030, 0, 1),
    scopes: ["openid", "profile", "w_member_social"], authorization: "member-posting", source: "portal-token" } as LinkedInCredential | null,
    author: "member-a", lookups: 0, posts: [] as Array<{ payload: Record<string, unknown>; init?: RequestInit }>,
    duringApproval: async () => {}, afterLookup: () => {} };
  const fetch = vi.fn<LinkedInPostFetch>(async (url, init) => {
    if (url.endsWith("/userinfo")) {
      state.lookups++; const sub = state.author; state.afterLookup();
      return new Response(JSON.stringify({ sub }), { status: 200 });
    }
    state.posts.push({ payload: JSON.parse(String(init?.body)), init });
    return new Response("{}", { status: 201, headers: { "x-restli-id": "urn:li:share:12345" } });
  });
  const load = vi.fn(async (_env: NodeJS.ProcessEnv) => state.credential);
  const approve = vi.fn<ToolContext["requestApproval"]>(async () => { await state.duringApproval(); return true; });
  const controller = new AbortController();
  const ctx = { root: "/private-fixture", requestApproval: approve, linkedinFetch: fetch, loadLinkedInCredential: load,
    now: () => Date.UTC(2029, 0, 1), signal: controller.signal, ...overrides } as unknown as ToolContext;
  return { state, fetch, load, approve, controller, ctx };
}

describe("LinkedIn author preview", () => {
  it.each(["PUBLIC", "CONNECTIONS"])("resolves and binds the personal author before %s approval", async visibility => {
    const f = fixture(); let lookupsAtApproval = 0;
    f.state.duringApproval = async () => { lookupsAtApproval = f.state.lookups; };
    const result = await linkedinPostTool.execute({ text: "Exact private post", visibility }, f.ctx);
    expect(lookupsAtApproval).toBe(1);
    expect(f.approve.mock.calls[0]?.[0]).toContain("urn:li:person:member-a");
    expect(f.approve.mock.calls[0]?.[3]).toMatchObject({ fresh: true, diff: expect.stringContaining("urn:li:person:member-a") });
    expect(f.state.posts).toHaveLength(1);
    expect(f.state.posts[0]?.payload).toMatchObject({ author: "urn:li:person:member-a", commentary: "Exact private post", visibility });
    expect(f.fetch.mock.calls.every(([, init]) => init?.signal === f.controller.signal)).toBe(true);
    expect(result).toMatchObject({ ok: true, effectDisposition: "confirmed", verification: { status: "unverified" } });
  });

  it("does not ask for publication approval if the author lookup fails", async () => {
    const f = fixture({ linkedinFetch: async () => new Response("{}", { status: 401 }) });
    expect(await linkedinPostTool.execute({ text: "Exact post" }, f.ctx)).toMatchObject({ effectDisposition: "denied" });
    expect(f.approve).not.toHaveBeenCalled();
  });
});

describe("LinkedIn credential binding", () => {
  it.each(["token", "client", "revoked", "scope", "expired"])("refuses %s drift during approval before any POST", async change => {
    const f = fixture();
    f.state.duringApproval = async () => {
      if (change === "token") f.state.credential!.accessToken = "different-token";
      if (change === "client") f.state.credential!.clientId = "different-client";
      if (change === "revoked") f.state.credential = null;
      if (change === "scope") f.state.credential!.scopes = ["openid", "profile"];
      if (change === "expired") f.state.credential!.expiresAt = 1;
    };
    const result = await linkedinPostTool.execute({ text: "Exact post" }, f.ctx);
    expect(result).toMatchObject({ ok: false, effectDisposition: "denied" });
    expect(f.state.posts).toHaveLength(0);
    expect(f.approve).toHaveBeenCalledOnce();
  });

  it("retains the original profile scope while waiting for approval", async () => {
    const env = { VANTA_HOME: "/fixture/original" }, f = fixture({ env });
    f.state.duringApproval = async () => { env.VANTA_HOME = "/fixture/other"; };
    expect(await linkedinPostTool.execute({ text: "Exact post" }, f.ctx)).toMatchObject({ ok: true });
    expect(f.load.mock.calls.every(([scope]) => scope.VANTA_HOME === "/fixture/original")).toBe(true);
  });
});

describe("LinkedIn late approval races", () => {
  it("refuses author drift while approval is pending", async () => {
    const f = fixture(); f.state.duringApproval = async () => { f.state.author = "member-b"; };
    expect(await linkedinPostTool.execute({ text: "Exact post" }, f.ctx)).toMatchObject({ effectDisposition: "denied" });
    expect(f.state.posts).toHaveLength(0);
  });

  it("rechecks the credential after the second identity lookup", async () => {
    const f = fixture();
    f.state.afterLookup = () => { if (f.state.lookups === 2) f.state.credential!.accessToken = "changed-during-lookup"; };
    expect(await linkedinPostTool.execute({ text: "Exact post" }, f.ctx)).toMatchObject({ effectDisposition: "denied" });
    expect(f.state.posts).toHaveLength(0);
  });

  it.each(["before", "during"])("refuses cancellation %s approval without publishing", async when => {
    const f = fixture();
    if (when === "before") f.controller.abort();
    else f.state.duringApproval = async () => { f.controller.abort(); };
    expect(await linkedinPostTool.execute({ text: "Exact post" }, f.ctx)).toMatchObject({ effectDisposition: "denied" });
    expect(f.state.posts).toHaveLength(0);
    if (when === "before") expect(f.fetch).not.toHaveBeenCalled();
  });
});
