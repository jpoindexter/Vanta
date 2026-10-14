import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { envPath } from "../setup.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startControlHarness, type ControlHarness } from "./__fixtures__/control-harness.js";

const ENV_KEYS = ["VANTA_PROVIDER", "VANTA_MODEL", "VANTA_EFFORT_LEVEL", "VANTA_SERVICE_TIER", "OPENAI_API_KEY", "TZ", "CODEX_HOME"] as const;

let h: ControlHarness;
let saved: Record<string, string | undefined>;

beforeEach(async () => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.VANTA_PROVIDER = "codex";
  process.env.VANTA_MODEL = "gpt-5.5";
  process.env.CODEX_HOME = "/nonexistent/vanta-test-codex-home";
  delete process.env.VANTA_EFFORT_LEVEL;
  h = await startControlHarness();
});
afterEach(async () => {
  await h.stop();
  for (const key of ENV_KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
});

const config = async () => (await h.get("/api/config")).body;
const set = (values: Record<string, unknown>) => h.post("/api/config", { set: values });

describe("config facade", () => {
  it("serves a nested record and a schema that agree on exactly the settings Vanta applies", async () => {
    const record = await config();
    const { fields, category_order } = (await h.get("/api/config/schema")).body;
    expect(Object.keys(fields).sort()).toEqual([
      "agent.reasoning_effort", "agent.service_tier", "approvals.mode", "display.show_reasoning", "stt.enabled", "timezone", "voice.max_recording_seconds",
    ]);
    expect(category_order).toEqual(["model", "safety", "chat", "voice"]);
    expect(record.display.show_reasoning).toBe(true);
    expect(fields["agent.reasoning_effort"].options).toEqual(["low", "medium", "high", "xhigh"]);
    expect(fields.timezone).toMatchObject({ type: "select", searchable: true });
  });

  it("stores a preference in the home and reads it back", async () => {
    const response = await set({ "display.show_reasoning": false, "voice.max_recording_seconds": 45 });
    expect(response.body).toMatchObject({ ok: true, applied: ["display.show_reasoning", "voice.max_recording_seconds"] });
    expect(JSON.parse(await readFile(join(h.home, "desktop-settings.json"), "utf8"))).toEqual({ showReasoning: false, maxRecordingSeconds: 45 });
    expect((await config()).voice.max_recording_seconds).toBe(45);
    expect((await config()).display.show_reasoning).toBe(false);
  });

  it("applies a timezone to the server process and clears it when blanked", async () => {
    expect((await set({ timezone: "Europe/Madrid" })).status).toBe(200);
    expect(process.env.TZ).toBe("Europe/Madrid");
    expect((await set({ timezone: "" })).status).toBe(200);
    expect(process.env.TZ).toBeUndefined();
    expect((await set({ timezone: "Mars/Olympus" })).body.error).toMatch(/must be one of/);
  });

  it("sets the default effort for a model that supports it, and refuses one it does not", async () => {
    const high = await set({ "agent.reasoning_effort": "high" });
    expect(high.body).toMatchObject({ ok: true });
    expect((await config()).agent.reasoning_effort).toBe("high");
    expect(await readFile(envPath(h.root), "utf8")).toContain("VANTA_EFFORT_LEVEL=high");
    const refused = await set({ "agent.reasoning_effort": "max" });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/must be one of low, medium, high, xhigh/);
    expect((await config()).agent.reasoning_effort).toBe("high");
  });

  it("leaves model-dependent fields out when the model offers none", async () => {
    process.env.VANTA_PROVIDER = "ollama";
    process.env.VANTA_MODEL = "llama3";
    const { fields } = (await h.get("/api/config/schema")).body;
    expect(fields["agent.reasoning_effort"]).toBeUndefined();
    expect(fields["agent.service_tier"]).toBeUndefined();
    const refused = await set({ "agent.reasoning_effort": "high" });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/does not apply to the current model/);
  });

  it("refuses off for approvals and names where Full access lives", async () => {
    const refused = await set({ "approvals.mode": "off" });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/must be one of manual, smart/);
  });

  it("refuses unknown keys, wrong types and bad values without applying anything in the patch", async () => {
    expect((await set({ "terminal.cwd": "/tmp" })).body.error).toMatch(/not a setting Vanta Desktop applies/);
    expect((await set({ "stt.enabled": "yes" })).body.error).toMatch(/true or false/);
    expect((await set({ "voice.max_recording_seconds": 9999 })).body.error).toMatch(/must be at most 600|600/);
    const mixed = await set({ "display.show_reasoning": false, "stt.enabled": "nope" });
    expect(mixed.status).toBe(400);
    expect((await config()).display.show_reasoning).toBe(true);
    expect((await h.post("/api/config", { set: {}, extra: 1 })).status).toBe(400);
  });

  it("lists which provider keys are set without ever returning a key", async () => {
    process.env.OPENAI_API_KEY = "sk-test-not-a-real-key-123";
    const response = await h.get("/api/env");
    expect(response.body.OPENAI_API_KEY).toMatchObject({ is_set: true, is_password: true, provider: "openai", redacted_value: null });
    expect(JSON.stringify(response.body)).not.toContain("sk-test-not-a-real-key-123");
  });
});
