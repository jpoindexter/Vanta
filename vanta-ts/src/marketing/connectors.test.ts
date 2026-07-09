import { describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeAmplitude, normalizeCustomerIo, readMarketing } from "./connectors.js";

describe("marketing connectors", () => {
  it("normalizes Amplitude events and Customer.io campaigns", () => {
    expect(normalizeAmplitude({ events: [{ event_id: "e1", event_type: "Signup", count: 12, event_time: "2026-07-01" }] })).toEqual([
      { provider: "amplitude", kind: "event", id: "e1", name: "Signup", metric: 12, at: "2026-07-01" },
    ]);
    expect(normalizeCustomerIo({ campaigns: [{ id: "c1", name: "Welcome", sent_count: 20, created: "2026-07-02" }] })).toEqual([
      { provider: "customerio", kind: "campaign", id: "c1", name: "Welcome", metric: 20, at: "2026-07-02" },
    ]);
  });

  it("reads fixture data for deterministic review runs", async () => {
    const dir = join(tmpdir(), `vanta-marketing-${Date.now()}`);
    const fixture = join(dir, "amp.json");
    await mkdir(dir, { recursive: true });
    await writeFile(fixture, JSON.stringify({ events: [{ event_id: "e2", event_type: "Purchase" }] }));
    try {
      expect(await readMarketing({ provider: "amplitude", fixture })).toMatchObject([{ id: "e2", name: "Purchase" }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
