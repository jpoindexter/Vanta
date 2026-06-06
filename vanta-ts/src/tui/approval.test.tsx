import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { ApprovalPrompt, buildApprovalOptions } from "./approval.js";

const ESC = String.fromCharCode(27); const KEY = { down: ESC + "[B", up: ESC + "[A", enter: String.fromCharCode(13), esc: ESC };
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

describe("buildApprovalOptions", () => {
  it("offers once/session/always/deny when a tool name keys the allowlist", () => {
    expect(buildApprovalOptions("git_commit").map((o) => o.key)).toEqual(["once", "session", "always", "deny"]);
    expect(buildApprovalOptions("git_commit")[2]!.label).toBe("Always allow git_commit");
  });
  it("falls back to once/deny when there is no tool name to key", () => {
    expect(buildApprovalOptions().map((o) => o.key)).toEqual(["once", "deny"]);
  });
});

describe("ApprovalPrompt keyboard", () => {
  const base = { action: "git commit", reason: "records changes", toolName: "git_commit", width: 80 };

  it("renders the action + four options", () => {
    const { lastFrame, unmount } = render(<ApprovalPrompt {...base} onChoose={() => {}} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("git_commit");
    expect(frame).toContain("Allow once");
    expect(frame).toContain("Always allow git_commit");
    expect(frame).toContain("Deny");
    unmount();
  });

  it("number key 2 picks 'allow this session'", async () => {
    const onChoose = vi.fn();
    const { stdin, unmount } = render(<ApprovalPrompt {...base} onChoose={onChoose} />);
    stdin.write("2");
    await tick();
    expect(onChoose).toHaveBeenCalledWith("session");
    unmount();
  });

  it("↓ + ⏎ confirms the highlighted option", async () => {
    const onChoose = vi.fn();
    const { stdin, unmount } = render(<ApprovalPrompt {...base} onChoose={onChoose} />);
    stdin.write(KEY.down); // once -> session
    await tick();
    stdin.write(KEY.enter);
    await tick();
    expect(onChoose).toHaveBeenCalledWith("session");
    unmount();
  });

  it("Esc denies", async () => {
    const onChoose = vi.fn();
    const { stdin, unmount } = render(<ApprovalPrompt {...base} onChoose={onChoose} />);
    stdin.write(KEY.esc);
    await tick();
    expect(onChoose).toHaveBeenCalledWith("deny");
    unmount();
  });
});
