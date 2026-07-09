import { describe, it, expect } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildExportDialogData,
  renderConversationExport,
  writeConversationExport,
  type ExportContext,
} from "./export-actions.js";

const context: ExportContext = {
  sessionId: "s1",
  title: "Demo",
  messages: [
    { role: "system", content: "sys" },
    { role: "user", content: "fix it" },
    { role: "assistant", content: "<thinking>private chain</thinking>\nDone", toolCalls: [{ id: "1", name: "shell_cmd", arguments: { cmd: "npm test" } }] },
    { role: "tool", toolCallId: "1", name: "shell_cmd", content: "passed" },
  ],
};

describe("export dialog actions", () => {
  it("renders markdown without thinking by default and with tool output", () => {
    const body = renderConversationExport(context, { format: "markdown", includeTools: true, includeThinking: false, destination: "file" });
    expect(body).toContain("# Demo");
    expect(body).toContain("Done");
    expect(body).toContain("shell_cmd");
    expect(body).toContain("passed");
    expect(body).not.toContain("private chain");
  });

  it("can render json without tool calls/results", () => {
    const body = renderConversationExport(context, { format: "json", includeTools: false, includeThinking: false, destination: "file" });
    expect(body).toContain('"sessionId": "s1"');
    expect(body).not.toContain("shell_cmd");
    expect(body).not.toContain("passed");
  });

  it("writes the selected export to .vanta/exports", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-export-dialog-"));
    const data = buildExportDialogData(root, context, { format: "text", includeTools: false, includeThinking: false, destination: "file" });
    const result = await writeConversationExport(root, data);
    expect(result.ok).toBe(true);
    expect(await readFile(join(root, ".vanta", "exports", "s1.text"), "utf8")).toContain("You: fix it");
  });

  it("supports clipboard destination through the test clipboard gate", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-export-dialog-"));
    const data = buildExportDialogData(root, context, { format: "markdown", includeTools: true, includeThinking: false, destination: "clipboard" });
    const result = await writeConversationExport(root, data, { VANTA_TEST_CLIPBOARD: "1" });
    expect(result).toMatchObject({ ok: true, message: "copied markdown export to clipboard" });
  });
});
