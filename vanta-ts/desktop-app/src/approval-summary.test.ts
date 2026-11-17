import { describe, expect, it } from "vitest";
import { summarizeApproval } from "./approval-summary.js";
import type { Approval, PermissionKind, PermissionSection } from "./types.js";

function approval(kind: PermissionKind, subject: string, sections: PermissionSection[], extra: Partial<Approval> = {}): Approval {
  return {
    id: "a1", action: extra.action ?? subject, reason: extra.reason ?? "", toolName: "tool",
    request: { kind, title: `${kind} permission request`, subject, reason: extra.reason ?? "", sections },
  };
}

describe("summarizeApproval", () => {
  it("names a file edit by the exact file and drops the repeated target/change rows", () => {
    const result = summarizeApproval(approval("file_edit", "brief.md", [
      { label: "Target file", value: "brief.md", tone: "code" },
      { label: "Change", value: "Modifies existing file content.", tone: "danger" },
    ], { reason: "modifying existing file content" }));
    expect(result.headline).toBe("Edit brief.md");
    expect(result.lede).toBe("Modifying existing file content.");
    expect(result.preview).toBeUndefined();
    expect(result.details).toEqual([]);
  });

  it("promotes the diff preview and keeps unrelated detail rows", () => {
    const result = summarizeApproval(approval("file_write", "notes.md", [
      { label: "Target file", value: "notes.md" },
      { label: "Write mode", value: "Overwrites existing content." },
      { label: "Preview", value: "- old\n+ new", tone: "code" },
    ], { action: "Overwrite existing file notes.md" }));
    expect(result.headline).toBe("Overwrite notes.md");
    expect(result.preview).toEqual({ label: "Preview", text: "- old\n+ new" });
    expect(result.details).toEqual([]);
  });

  it("shows the shell command as the preview and keeps the options row", () => {
    const result = summarizeApproval(approval("bash", "rm -rf build", [
      { label: "Command", value: "rm -rf build", tone: "code" },
      { label: "Options", value: "Runs inside the current project root.", tone: "muted" },
    ]));
    expect(result.headline).toBe("Run a command");
    expect(result.preview?.text).toBe("rm -rf build");
    expect(result.details.map((section) => section.label)).toEqual(["Options"]);
  });

  it("names the host for web fetches and keeps the full address as the preview", () => {
    const result = summarizeApproval(approval("web_fetch", "https://example.com/a?b=1", [{ label: "Target", value: "https://example.com/a?b=1" }]));
    expect(result.headline).toBe("Open example.com");
    expect(result.preview).toEqual({ label: "Address", text: "https://example.com/a?b=1" });
  });

  it("falls back to the plain action for unknown kinds and never emits an empty lede sentence", () => {
    const result = summarizeApproval(approval("generic", "Send the weekly digest", [{ label: "Action", value: "Send the weekly digest" }], { reason: "send the weekly digest" }));
    expect(result.headline).toBe("generic");
    expect(result.lede).toBe("Send the weekly digest.");
    expect(summarizeApproval({ id: "b", action: "Do thing", reason: "" }).lede).toBe("");
  });
});
