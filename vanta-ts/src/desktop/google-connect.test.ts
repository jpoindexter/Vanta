import { describe, expect, it, vi } from "vitest";
import { googleConnectStatus, performGoogleConnectAction } from "./google-connect.js";

function deps(state: { client: boolean; auth: boolean }) {
  return {
    hasClient: vi.fn(async () => state.client),
    hasAuth: vi.fn(async () => state.auth),
    ingestClient: vi.fn(async () => { state.client = true; }),
    begin: vi.fn(async () => ({ authUrl: "https://accounts.google.test/consent" })),
    complete: vi.fn(async () => { state.auth = true; }),
  };
}

describe("desktop Google Connect", () => {
  it("distinguishes client setup, consent, and ready states", async () => {
    const state = { client: false, auth: false };
    const injected = deps(state);
    await expect(googleConnectStatus({}, injected)).resolves.toMatchObject({ status: "needs_setup", clientConfigured: false, authorized: false });
    await performGoogleConnectAction({ action: "ingest_client", clientPath: "/tmp/client_secret.json" }, {}, injected);
    await expect(googleConnectStatus({}, injected)).resolves.toMatchObject({ status: "needs_setup", clientConfigured: true, authorized: false });
    await performGoogleConnectAction({ action: "complete" }, {}, injected);
    await expect(googleConnectStatus({}, injected)).resolves.toMatchObject({ status: "ready", clientConfigured: true, authorized: true });
  });

  it("returns the consent URL only after the client is configured", async () => {
    const state = { client: false, auth: false };
    const injected = deps(state);
    await expect(performGoogleConnectAction({ action: "start" }, {}, injected)).rejects.toThrow("Add the Google client JSON");
    state.client = true;
    await expect(performGoogleConnectAction({ action: "start" }, {}, injected)).resolves.toMatchObject({
      authUrl: "https://accounts.google.test/consent",
    });
  });

  it("requires a client file path and rejects unknown actions", async () => {
    const injected = deps({ client: false, auth: false });
    await expect(performGoogleConnectAction({ action: "ingest_client", clientPath: "" }, {}, injected)).rejects.toThrow("client_secret.json");
    await expect(performGoogleConnectAction({ action: "remove" }, {}, injected)).rejects.toThrow("action must be");
  });
});
