import { ToolRegistry } from "./registry.js";
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { shellCmdTool } from "./shell-cmd.js";
import { inspectStateTool } from "./inspect-state.js";
import { webSearchTool } from "./web-search.js";
import { webFetchTool } from "./web-fetch.js";
import { writeSkillTool } from "./write-skill.js";
import { recallTool } from "./recall.js";
import { screenshotTool } from "./screenshot.js";
import { browserNavigateTool } from "./browser-navigate.js";
import { browserExtractTool } from "./browser-extract.js";
import { describeImageTool } from "./describe-image.js";
import { runCodeTool } from "./run-code.js";
import { lspDiagnosticsTool, lspDefinitionTool } from "./lsp.js";
import {
  gitStatusTool,
  gitDiffTool,
  gitCommitTool,
  gitPushTool,
  gitBranchTool,
  gitCheckoutTool,
} from "./git.js";

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
  registry.register(screenshotTool);
  registry.register(browserNavigateTool);
  registry.register(browserExtractTool);
  registry.register(describeImageTool);
  registry.register(runCodeTool);
  registry.register(lspDiagnosticsTool);
  registry.register(lspDefinitionTool);
  registry.register(gitStatusTool);
  registry.register(gitDiffTool);
  registry.register(gitCommitTool);
  registry.register(gitPushTool);
  registry.register(gitBranchTool);
  registry.register(gitCheckoutTool);
  return registry;
}

export { ToolRegistry } from "./registry.js";
