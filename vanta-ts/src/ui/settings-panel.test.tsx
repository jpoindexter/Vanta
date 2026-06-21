import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { SettingsPanel, nextSettingsTab, type SettingsTab } from "./settings-panel.js";
import type { Settings } from "../settings/store.js";
import type { StatusReport } from "../status.js";
import type { SessionCost } from "../pricing.js";

const config: Settings = { effortLevel: "high", disableAgentView: true };

const status: StatusReport = {
  kernel: { url: "http://127.0.0.1:7788", up: true },
  provider: { id: "openai", ok: true, model: "gpt-5", contextWindow: 200000 },
  keys: [{ envVar: "OPENAI_API_KEY", label: "OpenAI", present: true }],
  store: { home: "/home/.vanta", skills: 44, memories: 3 },
  goals: { active: 1, total: 5 },
  notices: [],
};

const usage: SessionCost = {
  localUsd: 0,
  frontierUsd: 1.2345,
  localTurns: 2,
  frontierTurns: 4,
  totalTokensSaved: 0,
};

function render(tab: SettingsTab, over: { config?: Settings; status?: StatusReport; usage?: SessionCost } = {}) {
  return renderUi(h(SettingsPanel, {
    tab,
    config: over.config ?? config,
    status: over.status ?? status,
    usage: "usage" in over ? over.usage : usage,
  }));
}

describe("SettingsPanel — tab header", () => {
  it("renders the three tab names with the active one marked", async () => {
    const inst = render("status");
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Config");
    expect(out).toContain("Status");
    expect(out).toContain("Usage");
    // The active tab carries the ▸ marker.
    expect(out).toContain("▸ Status");
    expect(out).not.toContain("▸ Config");
    inst.unmount();
  });
});

describe("SettingsPanel — Config tab", () => {
  it("renders the settings as key/value rows", async () => {
    const inst = render("config");
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("▸ Config");
    expect(out).toContain("effortLevel");
    expect(out).toContain("high");
    expect(out).toContain("disableAgentView");
    expect(out).toContain("true");
    inst.unmount();
  });

  it("shows a clean empty row when no settings are configured", async () => {
    const inst = render("config", { config: {} });
    await tick();
    expect(inst.lastFrame()).toContain("no settings configured");
    inst.unmount();
  });
});

describe("SettingsPanel — Status tab", () => {
  it("renders the provider/kernel/store health lines", async () => {
    const inst = render("status");
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("kernel");
    expect(out).toContain("up");
    expect(out).toContain("provider");
    expect(out).toContain("gpt-5");
    expect(out).toContain("api keys");
    expect(out).toContain("store");
    expect(out).toContain("44 skill(s)");
    expect(out).toContain("goals");
    expect(out).toContain("1 active / 5 total");
    inst.unmount();
  });

  it("renders a kernel-down / goals-error status cleanly", async () => {
    const down: StatusReport = {
      ...status,
      kernel: { url: status.kernel.url, up: false },
      goals: { error: "kernel down" },
    };
    const inst = render("status", { status: down });
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("down");
    expect(out).toContain("kernel down");
    inst.unmount();
  });
});

describe("SettingsPanel — Usage tab", () => {
  it("renders the session cost split", async () => {
    const inst = render("usage");
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("▸ Usage");
    expect(out).toContain("frontier");
    expect(out).toContain("4 turn(s) metered");
    expect(out).toContain("local");
    expect(out).toContain("2 turn(s) free");
    inst.unmount();
  });

  it("shows a clean no-turns row when usage is undefined", async () => {
    const inst = render("usage", { usage: undefined });
    await tick();
    expect(inst.lastFrame()).toContain("no turns yet");
    inst.unmount();
  });
});

describe("SettingsPanel — unknown tab", () => {
  it("falls back to the Config tab for an unknown tab value", async () => {
    const inst = render("bogus" as SettingsTab);
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("effortLevel"); // config body rendered
    inst.unmount();
  });
});

describe("nextSettingsTab — pure cycle", () => {
  it("cycles config → status → usage → config", () => {
    expect(nextSettingsTab("config")).toBe("status");
    expect(nextSettingsTab("status")).toBe("usage");
    expect(nextSettingsTab("usage")).toBe("config");
  });
});
