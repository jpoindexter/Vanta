import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { executeToolEffect } from "../effects/tool-effect-gateway.js";
import { gmailDraftTool, gmailSendTool } from "./gmail.js";
import type { ToolContext } from "./types.js";

const auth = vi.hoisted(() => ({ account: "a" }));
vi.mock("../google/auth.js", () => ({ getAccessToken: vi.fn(async () => `fixture-access-${auth.account}`) }));
vi.mock("../google/auth-store.js", () => ({ loadTokens: vi.fn(async () => ({ refresh_token: `fixture-refresh-${auth.account}` })) }));
const roots: string[] = [];
const message = { to: "recipient@example.invalid", subject: "Research brief", body: "Review this draft only." };

beforeEach(() => { auth.account = "a"; });
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

it.each([gmailDraftTool, gmailSendTool])("$schema.name stops when the connected account changes during approval", async tool => {
  const root = await mkdtemp(join(tmpdir(), "vanta-gmail-account-"));
  roots.push(root);
  const effects: string[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url.endsWith("/profile")) return Response.json({ emailAddress: "a@example.invalid" });
    effects.push(new Headers(init.headers).get("authorization")!);
    return Response.json({ id: "fixture-message" });
  });
  vi.stubGlobal("fetch", fetch);
  const ctx: ToolContext = {
    root, sessionId: "fixture-session", effectCallId: "fixture-call",
    safety: { assess: async () => ({ risk: "allow" }) } as unknown as ToolContext["safety"],
    requestApproval: vi.fn(async () => { auth.account = "b"; return true; }),
  };
  const result = await executeToolEffect(tool.schema.name, message, tool, ctx);
  expect(effects).toEqual([]);
  expect(result).toMatchObject({ ok: false, effectDisposition: "denied" });
  expect(result.output).toContain("account changed");
  expect(ctx.requestApproval).toHaveBeenCalledOnce();
});

it.each([gmailDraftTool, gmailSendTool])("$schema.name does not submit after a canceled approval returns late", async tool => {
  const controller = new AbortController();
  const fetch = vi.fn(async (url: string) => Response.json(url.endsWith("/profile")
    ? { emailAddress: "a@example.invalid" } : { id: "fixture-message" }));
  vi.stubGlobal("fetch", fetch);
  const ctx: ToolContext = {
    root: "/tmp/vanta-gmail-cancel-fixture", signal: controller.signal,
    safety: undefined as unknown as ToolContext["safety"],
    requestApproval: vi.fn(async () => { controller.abort(); return true; }),
  };
  const result = await tool.execute(message, ctx);
  expect(fetch).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ ok: false, effectDisposition: "denied" });
});
