import { describe, it, expect, afterEach } from "vitest";
import { agentLaunchRedirect, isTmuxAgentLaunch } from "./agent-launch-hint.js";
import { sandboxAgentRefusal } from "./shell-cmd.js";

describe("agentLaunchRedirect", () => {
  it("names call_agent + agent_session when a known agent is launched", () => {
    const r = agentLaunchRedirect("tmux new-session -d -s x claude");
    expect(r).toContain("call_agent");
    expect(r).toContain("agent_session");
  });
  it("returns null for a non-agent command", () => {
    expect(agentLaunchRedirect("ls -la")).toBeNull();
    expect(agentLaunchRedirect("tmux new-session -d -s x htop")).toBeNull();
  });
});

describe("isTmuxAgentLaunch", () => {
  it("is true only when tmux AND a known agent both appear", () => {
    expect(isTmuxAgentLaunch("tmux new-session -d -s x claude")).toBe(true);
    expect(isTmuxAgentLaunch("claude -p hi")).toBe(false); // no tmux
    expect(isTmuxAgentLaunch("tmux ls")).toBe(false); // no agent
  });
});

describe("sandboxAgentRefusal", () => {
  const snap = { shell: process.env.VANTA_SHELL_SANDBOX, sand: process.env.VANTA_SANDBOX };
  const set = (k: string, v: string | undefined) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
  afterEach(() => {
    set("VANTA_SHELL_SANDBOX", snap.shell);
    set("VANTA_SANDBOX", snap.sand);
  });

  it("refuses a tmux-agent launch under the sandbox, naming the supported tools", () => {
    process.env.VANTA_SHELL_SANDBOX = "1";
    const r = sandboxAgentRefusal("tmux new-session -d -s x claude");
    expect(r?.ok).toBe(false);
    expect(r?.output).toContain("call_agent");
    expect(r?.output).toContain("agent_session");
  });
  it("does not refuse when the sandbox is off", () => {
    process.env.VANTA_SHELL_SANDBOX = "0";
    set("VANTA_SANDBOX", undefined);
    expect(sandboxAgentRefusal("tmux new-session -d -s x claude")).toBeNull();
  });
  it("does not refuse a non-agent tmux command", () => {
    process.env.VANTA_SHELL_SANDBOX = "1";
    expect(sandboxAgentRefusal("tmux new-session -d -s x htop")).toBeNull();
  });
});
