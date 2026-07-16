import { describe, expect, it } from "vitest";
import { buildPermissionRequest } from "./request.js";

describe("buildPermissionRequest", () => {
  it("builds a bash-specific request from shell_cmd descriptors", () => {
    const req = buildPermissionRequest({
      toolName: "shell_cmd",
      action: "run shell command: git status --short",
      reason: "kernel ask",
    });

    expect(req.kind).toBe("bash");
    expect(req.title).toBe("Bash permission request");
    expect(req.subject).toBe("git status --short");
    expect(req.sections).toContainEqual({ label: "Command", value: "git status --short", tone: "code" });
    expect(req.sections).toContainEqual({ label: "Options", value: "Runs inside the current project root.", tone: "muted" });
  });

  it("builds file edit and file write requests with the target path surfaced", () => {
    const edit = buildPermissionRequest({ toolName: "edit_file", action: "Edit file src/app.ts", reason: "modifying existing file content", detail: { diff: "- old\n+ new" } });
    const write = buildPermissionRequest({ toolName: "write_file", action: "Overwrite existing file notes.md", reason: "file already exists" });

    expect(edit.kind).toBe("file_edit");
    expect(edit.title).toBe("File edit permission request");
    expect(edit.sections).toContainEqual({ label: "Target file", value: "src/app.ts", tone: "code" });
    expect(edit.sections).toContainEqual({ label: "Preview", value: "- old\n+ new", tone: "code" });
    expect(write.kind).toBe("file_write");
    expect(write.title).toBe("File write permission request");
    expect(write.sections).toContainEqual({ label: "Target file", value: "notes.md", tone: "code" });
  });

  it("maps web, skill, sandbox, and computer-control tools to dedicated request types", () => {
    expect(buildPermissionRequest({ toolName: "web_fetch", action: "fetch url https://example.com", reason: "" }).kind).toBe("web_fetch");
    expect(buildPermissionRequest({ toolName: "write_skill", action: "record a learned skill in vanta's memory", reason: "" }).kind).toBe("skill");
    expect(buildPermissionRequest({ toolName: "run_code", action: "run javascript code", reason: "" }).kind).toBe("sandbox");
    expect(buildPermissionRequest({ toolName: "browser_act", action: "drive browser: 2 action(s)", reason: "" }).kind).toBe("computer_use");
  });
});
