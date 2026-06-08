import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { editCommand, editText } from "./edit-text.js";

describe("editCommand", () => {
  it("uses --wait file for VS Code-family editors", () => {
    expect(editCommand("code", "/tmp/x.md")).toEqual({ cmd: "code", args: ["--wait", "/tmp/x.md"] });
    expect(editCommand("cursor", "/tmp/x.md")).toEqual({ cmd: "cursor", args: ["--wait", "/tmp/x.md"] });
    expect(editCommand("windsurf", "/tmp/x.md")).toEqual({ cmd: "windsurf", args: ["--wait", "/tmp/x.md"] });
  });

  it("uses --wait file for Sublime", () => {
    expect(editCommand("subl", "/tmp/x.md")).toEqual({ cmd: "subl", args: ["--wait", "/tmp/x.md"] });
  });

  it("passes file directly for terminal editors", () => {
    expect(editCommand("vim", "/tmp/x.md")).toEqual({ cmd: "vim", args: ["/tmp/x.md"] });
    expect(editCommand("nano", "/tmp/x.md")).toEqual({ cmd: "nano", args: ["/tmp/x.md"] });
  });

  it("passes through extra flags for unknown editors", () => {
    expect(editCommand("myeditor -w", "/tmp/x.md")).toEqual({ cmd: "myeditor", args: ["-w", "/tmp/x.md"] });
  });
});

describe("editText", () => {
  it("returns ok:true with unchanged content when editor is a no-op (true)", async () => {
    // `true` exits 0 without touching the file
    const result = await editText("hello world", { VANTA_EDITOR: "true" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe("hello world");
  });

  it("returns the modified content after the editor rewrites the file", async () => {
    // Write a small shell script that overwrites its first argument
    const script = join(tmpdir(), "vanta-test-editor.sh");
    await writeFile(script, "#!/bin/sh\nprintf 'updated text' > \"$1\"\n", { mode: 0o755 });

    const result = await editText("original", { VANTA_EDITOR: script });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe("updated text");
  });

  it("returns ok:false when the editor exits non-zero", async () => {
    const result = await editText("hi", { VANTA_EDITOR: "false" });
    expect(result.ok).toBe(false);
  });
});
