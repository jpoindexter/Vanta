import { mkdtemp, rm } from "node:fs/promises";
import type http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDesktopServer, type DesktopState } from "../desktop/server.js";
import { exchangeCompanionCode, startCompanionPairing } from "./auth.js";

const boundaryToken = "fixture-desktop-boundary";
const desktopHeaders = { "x-vanta-desktop-boundary": boundaryToken };
const homes: string[] = [];
const servers: http.Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

async function fixture(enabled: boolean, local = true) {
  const home = await mkdtemp(join(tmpdir(), "vanta-companion-boundary-"));
  homes.push(home);
  const resolveApproval = vi.fn();
  const state: DesktopState = {
    root: home,
    _chatActive: true,
    pendingApproval: { id: "fixture-approval", action: "fixture-only", reason: "synthetic boundary test", resolve: resolveApproval },
  };
  const server = createDesktopServer(home, {
    enabled, home, port: 0, boundaryToken, env: {},
    sessions: new Map([["default", state]]),
    isLoopback: () => local,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, home, state, resolveApproval };
}

async function pair(base: string, home: string, headers: Record<string, string> = {}) {
  const { code } = await startCompanionPairing(home);
  const response = await fetch(`${base}/api/companion/pair`, {
    method: "POST", headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ code, name: "Fixture device" }),
  });
  expect(response.status).toBe(200);
  const body = await response.json() as { token: string };
  expect(body.token).toBeTruthy();
  return body.token;
}

describe("local companion authentication boundary", () => {
  it.each([
    ["GET", "/approval"],
    ["POST", "/approval"],
    ["POST", "/chat"],
    ["GET", "/events"],
    ["GET", "/info"],
  ])("rejects unauthenticated %s %s even when companion LAN access is disabled", async (method, path) => {
    const { base, state, resolveApproval } = await fixture(false);
    const response = await fetch(`${base}/api/companion${path}`, {
      method,
      headers: { origin: "http://untrusted.example", "sec-fetch-site": "cross-site", "content-type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify({ id: "fixture-approval", decision: "allow", message: "fixture-only" }) } : {}),
    });
    expect(response.status).toBe(403);
    expect(state.pendingApproval?.id).toBe("fixture-approval");
    expect(resolveApproval).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([
    {},
    { "x-vanta-desktop-boundary": "incorrect" },
    { ...desktopHeaders, origin: "http://untrusted.example" },
    { ...desktopHeaders, "sec-fetch-site": "cross-site" },
    { ...desktopHeaders, origin: "capacitor://localhost" },
  ])("does not promote an untrusted loopback request to desktop access (%j)", async (headers) => {
    const { base } = await fixture(true);
    const response = await fetch(`${base}/api/companion/approval`, { headers });
    expect(response.status).toBe(401);
  });

  it.each([false, true])("preserves trusted local access with companion enabled=%s", async (enabled) => {
    const { base } = await fixture(enabled);
    const headers = { ...desktopHeaders, origin: base, "sec-fetch-site": "same-origin" };
    const approval = await fetch(`${base}/api/companion/approval`, { headers });
    expect(approval.status).toBe(200);
    expect(await approval.json()).toMatchObject({ id: "fixture-approval" });
    const info = await fetch(`${base}/api/companion/info`, { headers });
    expect(info.status).toBe(200);
    expect(await info.json()).toMatchObject({ enabled });
    const controller = new AbortController();
    const events = await fetch(`${base}/api/companion/events`, { headers, signal: controller.signal });
    expect(events.status).toBe(200);
    expect(events.headers.get("content-type")).toContain("text/event-stream");
    controller.abort();
  });

  it("requires trusted desktop access to create a pairing code", async () => {
    const { base } = await fixture(true);
    expect((await fetch(`${base}/api/companion/pair/start`, { method: "POST" })).status).toBe(403);
    const trusted = await fetch(`${base}/api/companion/pair/start`, { method: "POST", headers: desktopHeaders });
    expect(trusted.status).toBe(200);
    expect(await trusted.json()).toMatchObject({ code: expect.any(String) });
  });

  it("does not accept a Desktop boundary token through a companion URL query", async () => {
    const { base } = await fixture(false);
    const response = await fetch(`${base}/api/companion/approval?boundary=${boundaryToken}`);
    expect(response.status).toBe(403);
  });

  it.each([true, false])("preserves pairing bootstrap and native bearer access over local=%s transport", async (local) => {
    const { base, home } = await fixture(true, local);
    const native = { origin: "capacitor://localhost", "sec-fetch-site": "cross-site" };
    const token = await pair(base, home, native);
    const headers = { ...native, authorization: `Bearer ${token}` };
    const approval = await fetch(`${base}/api/companion/approval`, { headers });
    expect(approval.status).toBe(200);
    expect(await approval.json()).toMatchObject({ id: "fixture-approval" });
    expect((await fetch(`${base}/api/companion/info`, { headers })).status).toBe(403);
    expect((await fetch(`${base}/api/companion/pair/start`, { method: "POST", headers })).status).toBe(403);
    expect((await fetch(`${base}/api/companion/approval`, { headers: { ...native, authorization: "Bearer incorrect" } })).status).toBe(401);
    const controller = new AbortController();
    const events = await fetch(`${base}/api/companion/events`, { headers, signal: controller.signal });
    expect(events.status).toBe(200);
    controller.abort();
  });

  it("keeps pairing bootstrap unavailable when companion access is disabled", async () => {
    const { base, home } = await fixture(false);
    const { code } = await startCompanionPairing(home);
    const response = await fetch(`${base}/api/companion/pair`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }),
    });
    expect(response.status).toBe(403);
    expect((await fetch(`${base}/api/companion/pair/start`, { method: "POST", headers: desktopHeaders })).status).toBe(403);
  });

  it("does not let a paired bearer bypass disabled companion access over loopback", async () => {
    const { base, home } = await fixture(false);
    const { code } = await startCompanionPairing(home);
    const paired = await exchangeCompanionCode(home, code, "Fixture device");
    if ("error" in paired) throw new Error(paired.error);
    const response = await fetch(`${base}/api/companion/approval`, { headers: { authorization: `Bearer ${paired.token}` } });
    expect(response.status).toBe(403);
  });

  it("does not grant remote requests desktop access from the boundary token", async () => {
    const { base } = await fixture(true, false);
    expect((await fetch(`${base}/api/companion/approval`, { headers: desktopHeaders })).status).toBe(401);
  });
});
