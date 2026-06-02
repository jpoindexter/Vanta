import { ToolRegistry } from "./registry.js";
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { shellCmdTool } from "./shell-cmd.js";
import { inspectStateTool } from "./inspect-state.js";

export function buildRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(shellCmdTool);
  registry.register(inspectStateTool);
  return registry;
}

export { ToolRegistry } from "./registry.js";
