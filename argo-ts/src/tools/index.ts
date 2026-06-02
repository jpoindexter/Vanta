import { ToolRegistry } from "./registry.js";
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { shellCmdTool } from "./shell-cmd.js";
import { inspectStateTool } from "./inspect-state.js";
import { webSearchTool } from "./web-search.js";
import { webFetchTool } from "./web-fetch.js";
import { writeSkillTool } from "./write-skill.js";
import { recallTool } from "./recall.js";

export function buildRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(shellCmdTool);
  registry.register(inspectStateTool);
  registry.register(webSearchTool);
  registry.register(webFetchTool);
  registry.register(writeSkillTool);
  registry.register(recallTool);
  return registry;
}

export { ToolRegistry } from "./registry.js";
