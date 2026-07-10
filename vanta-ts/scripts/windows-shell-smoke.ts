import { shellCmdTool } from "../src/tools/shell-cmd.js";
import type { ToolContext } from "../src/tools/types.js";

const context: ToolContext = {
  root: process.cwd(),
  safety: {} as ToolContext["safety"],
  requestApproval: async () => true,
};

const result = await shellCmdTool.execute({ command: "echo WINDOWS_SHELL_OK" }, context);
if (!result.ok || !result.output.includes("WINDOWS_SHELL_OK")) {
  throw new Error(`native shell command failed: ${result.output}`);
}

process.stdout.write(result.output.endsWith("\n") ? result.output : `${result.output}\n`);
