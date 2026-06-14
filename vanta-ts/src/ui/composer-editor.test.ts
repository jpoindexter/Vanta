import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { editInEditor } from "./composer-editor.js";

// Verifies the ^G round-trip (write buffer → run $EDITOR → read back). The
// TTY-restore behaviour after a full-screen editor still needs a manual check in
// a real terminal — that can't be exercised headlessly.

describe("editInEditor", () => {
  it("round-trips the buffer through $EDITOR", () => {
    const dir = mkdtempSync(join(tmpdir(), "vanta-ed-"));
    const fake = join(dir, "fake-editor.sh");
    writeFileSync(fake, '#!/bin/sh\necho "EDITED LINE" > "$1"\n');
    chmodSync(fake, 0o755);
    expect(editInEditor("original buffer", { ...process.env, VANTA_EDITOR: fake })).toBe("EDITED LINE");
  });

  it("returns the buffer unchanged when the editor can't run", () => {
    expect(editInEditor("keep me", { ...process.env, VANTA_EDITOR: "/nonexistent/xyz-editor" })).toBe("keep me");
  });
});
