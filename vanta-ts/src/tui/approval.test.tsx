import { describe, it, expect, vi } from "vitest";
import { render } from "./test-render.js";
import { ApprovalPrompt, buildApprovalOptions } from "./approval.js";

const ESC = String.fromCharCode(27); const KEY = { down: ESC + "[B", up: ESC + "[A", enter: String.fromCharCode(13), esc: ESC };
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 70)); // > the input parser's 50ms lone-Esc flush timeout

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

  it("renders the action, the kernel reason, and four options", () => {
    const { lastFrame, unmount } = render(<ApprovalPrompt {...base} onChoose={() => {}} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("git_commit"); // tool name in the title
    expect(frame).toContain("git commit"); // the gated action, surfaced on its own line
    expect(frame).toContain("why"); // the reason label
    expect(frame).toContain("records changes"); // the kernel's reason
    expect(frame).toContain("Allow once");
    expect(frame).toContain("Always allow git_commit");
    expect(frame).toContain("Deny");
    unmount();
  });

  it("clips a long command to one line so the box can't wrap", () => {
    const longCmd = "rm -rf " + "build/and/a/very/deep/nested/path".repeat(6);
    const { lastFrame, unmount } = render(<ApprovalPrompt {...base} action={longCmd} width={60} onChoose={() => {}} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("…"); // ellipsis proves the clip fired
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
