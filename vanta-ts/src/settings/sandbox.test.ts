import { describe, it, expect } from "vitest";
import {
  sandboxState, toggle, toConfig, withSandbox, sandboxEnv,
  cycleOverride, resolveToolSandbox, sandboxDoctor, resolveNetworkAccess,
} from "./sandbox.js";
import type { Settings } from "./store.js";

const empty: NodeJS.ProcessEnv = {};

describe("sandboxState — effective config from settings + env", () => {
  it("defaults to all-off with no settings and no env", () => {
    const s = sandboxState({}, empty);
    expect(s).toEqual({ enabled: false, shellOnly: false, allowNetwork: false, deniedDomains: [], dependencies: [], overrides: [] });
  });

  it("reads persisted settings when env is unset", () => {
    const settings: Settings = { sandbox: { enabled: true, allowNetwork: true, dependencies: ["ripgrep"] } };
    const s = sandboxState(settings, empty);
    expect(s.enabled).toBe(true);
    expect(s.allowNetwork).toBe(true);
    expect(s.dependencies).toEqual(["ripgrep"]);
  });

  it("reads persisted deniedDomains (defaults to empty)", () => {
    expect(sandboxState({}, empty).deniedDomains).toEqual([]);
    const s = sandboxState({ sandbox: { deniedDomains: ["evil.com"] } }, empty);
    expect(s.deniedDomains).toEqual(["evil.com"]);
  });

  it("env overrides persisted settings (env is runtime truth)", () => {
    const settings: Settings = { sandbox: { enabled: true } };
    expect(sandboxState(settings, { VANTA_SANDBOX: "0" }).enabled).toBe(false);
    expect(sandboxState({}, { VANTA_SANDBOX: "1" }).enabled).toBe(true);
  });

  it("maps each flag to its env var", () => {
    const env = { VANTA_SANDBOX: "1", VANTA_SHELL_SANDBOX: "1", VANTA_SANDBOX_NET: "1" };
    const s = sandboxState({}, env);
    expect([s.enabled, s.shellOnly, s.allowNetwork]).toEqual([true, true, true]);
  });
});

describe("toggle / persistence helpers", () => {
  it("toggle flips one flag without touching the others", () => {
    const s = sandboxState({}, empty);
    const next = toggle(s, "enabled");
    expect(next.enabled).toBe(true);
    expect(next.shellOnly).toBe(false);
    expect(s.enabled).toBe(false); // original unchanged (pure)
  });

  it("toConfig round-trips through withSandbox preserving other settings keys", () => {
    const s = toggle(sandboxState({}, empty), "shellOnly");
    const merged = withSandbox({ effortLevel: "high" }, toConfig(s));
    expect(merged.effortLevel).toBe("high");
    expect(merged.sandbox?.shellOnly).toBe(true);
  });

  it("toConfig persists deniedDomains", () => {
    const s = { ...sandboxState({}, empty), deniedDomains: ["evil.com"] };
    expect(toConfig(s).deniedDomains).toEqual(["evil.com"]);
  });

  it("sandboxEnv emits only the enabled flags", () => {
    expect(sandboxEnv(sandboxState({}, empty))).toEqual({});
    const all = sandboxState({}, { VANTA_SANDBOX: "1", VANTA_SHELL_SANDBOX: "1", VANTA_SANDBOX_NET: "1" });
    expect(sandboxEnv(all)).toEqual({ VANTA_SANDBOX: "1", VANTA_SHELL_SANDBOX: "1", VANTA_SANDBOX_NET: "1" });
  });
});

describe("cycleOverride + resolveToolSandbox", () => {
  it("cycles none → bypass → enforce → none", () => {
    let ov = cycleOverride([], "shell_cmd");
    expect(ov).toEqual([{ tool: "shell_cmd", rule: "bypass" }]);
    ov = cycleOverride(ov, "shell_cmd");
    expect(ov).toEqual([{ tool: "shell_cmd", rule: "enforce" }]);
    ov = cycleOverride(ov, "shell_cmd");
    expect(ov).toEqual([]);
  });

  it("override decides sandboxing regardless of the global flag", () => {
    const on = { ...sandboxState({}, empty), enabled: true, overrides: [{ tool: "git", rule: "bypass" as const }] };
    expect(resolveToolSandbox(on, "git")).toBe(false); // bypass beats enabled
    expect(resolveToolSandbox(on, "shell_cmd")).toBe(true); // no rule → global flag

    const off = { ...sandboxState({}, empty), enabled: false, overrides: [{ tool: "run_code", rule: "enforce" as const }] };
    expect(resolveToolSandbox(off, "run_code")).toBe(true); // enforce beats disabled
    expect(resolveToolSandbox(off, "git")).toBe(false);
  });
});

describe("resolveNetworkAccess — deniedDomains wins over allowNetwork", () => {
  it("denies a denied domain even when the network is allowed", () => {
    const s = { ...sandboxState({}, empty), allowNetwork: true, deniedDomains: ["evil.com"] };
    expect(resolveNetworkAccess(s, "evil.com")).toBe("deny");
    expect(resolveNetworkAccess(s, "api.evil.com")).toBe("deny"); // subdomain
    expect(resolveNetworkAccess(s, "good.com")).toBe("allow");
  });

  it("empty deny list = current allow/deny behavior", () => {
    const allowed = { ...sandboxState({}, empty), allowNetwork: true, deniedDomains: [] };
    expect(resolveNetworkAccess(allowed, "good.com")).toBe("allow");
    const isolated = { ...sandboxState({}, empty), allowNetwork: false, deniedDomains: [] };
    expect(resolveNetworkAccess(isolated, "good.com")).toBe("deny");
  });
});

describe("sandboxDoctor — pure diagnostics", () => {
  it("reports a backend on darwin and linux, none elsewhere", () => {
    const s = sandboxState({}, empty);
    expect(sandboxDoctor(s, "darwin").find((c) => c.label === "Backend")?.level).toBe("ok");
    expect(sandboxDoctor(s, "linux").find((c) => c.label === "Backend")?.level).toBe("ok");
    const win = sandboxDoctor(s, "win32").find((c) => c.label === "Backend");
    expect(win?.level).toBe("warn");
  });

  it("warns when enabled but no backend exists", () => {
    const s = { ...sandboxState({}, empty), enabled: true };
    const check = sandboxDoctor(s, "win32").find((c) => c.label === "Enablement");
    expect(check?.level).toBe("warn");
    expect(check?.detail).toContain("refuse to run");
  });

  it("warns when network is allowed (less isolated)", () => {
    const s = { ...sandboxState({}, empty), allowNetwork: true };
    expect(sandboxDoctor(s, "darwin").find((c) => c.label === "Network")?.level).toBe("warn");
  });

  it("summarizes override counts", () => {
    const s = { ...sandboxState({}, empty), overrides: [{ tool: "a", rule: "bypass" as const }, { tool: "b", rule: "enforce" as const }] };
    expect(sandboxDoctor(s, "darwin").find((c) => c.label === "Overrides")?.detail).toBe("1 bypass · 1 enforce");
  });
});
