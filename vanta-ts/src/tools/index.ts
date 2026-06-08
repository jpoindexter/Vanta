import { ToolRegistry } from "./registry.js";
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { shellCmdTool } from "./shell-cmd.js";
import { inspectStateTool } from "./inspect-state.js";
import { clarifyTool } from "./clarify.js";
import { roadmapMoveTool } from "./roadmap-move.js";
import { roadmapAddTool } from "./roadmap-add.js";
import { webSearchTool } from "./web-search.js";
import { webFetchTool } from "./web-fetch.js";
import { writeSkillTool } from "./write-skill.js";
import { recallTool } from "./recall.js";
import { screenshotTool } from "./screenshot.js";
import { browserNavigateTool } from "./browser-navigate.js";
import { browserExtractTool } from "./browser-extract.js";
import { describeImageTool } from "./describe-image.js";
import { compareVisionTool } from "./compare-vision.js";
import { lookAtScreenTool } from "./look-at-screen.js";
import { lookAtCameraTool } from "./look-at-camera.js";
import { brainTool } from "./brain.js";
import { todoTool } from "./todo.js";
import { watchVideoTool } from "./watch-video.js";
import { speakTool } from "./speak.js";
import { swarmTool } from "./swarm.js";
import { transcribeTool } from "./transcribe.js";
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
import { delegateTool } from "./delegate.js";
import { workflowTool } from "./workflow.js";
import { bgListTool, bgStatusTool } from "./bg-tasks.js";
import { graphQueryTool } from "./graph-query.js";
import { buildMountMcpTool } from "./mount-mcp.js";
import {
  gmailSearchTool,
  gmailReadTool,
  gmailDraftTool,
  gmailSendTool,
} from "./gmail.js";
import {
  calendarReadTool,
  calendarCreateTool,
  calendarUpdateTool,
} from "./calendar.js";
import {
  driveReadTool,
  driveCreateTool,
  driveUpdateTool,
} from "./drive.js";
import type { Tool } from "./types.js";

/**
 * Every tool the agent can use, in registration order. Kept as an array (rather
 * than registered inline) so {@link buildRegistry} can filter by name before
 * registering — used to give a subagent a registry without `delegate`.
 */
const ALL_TOOLS: readonly Tool[] = [
  readFileTool,
  writeFileTool,
  shellCmdTool,
  inspectStateTool,
  clarifyTool,
  roadmapMoveTool,
  roadmapAddTool,
  webSearchTool,
  webFetchTool,
  writeSkillTool,
  recallTool,
  screenshotTool,
  browserNavigateTool,
  browserExtractTool,
  describeImageTool,
  compareVisionTool,
  lookAtScreenTool,
  lookAtCameraTool,
  brainTool,
  todoTool,
  watchVideoTool,
  speakTool,
  swarmTool,
  workflowTool,
  graphQueryTool,
  transcribeTool,
  runCodeTool,
  lspDiagnosticsTool,
  lspDefinitionTool,
  gitStatusTool,
  gitDiffTool,
  gitCommitTool,
  gitPushTool,
  gitBranchTool,
  gitCheckoutTool,
  delegateTool,
  gmailSearchTool,
  gmailReadTool,
  gmailDraftTool,
  gmailSendTool,
  calendarReadTool,
  calendarCreateTool,
  calendarUpdateTool,
  driveReadTool,
  driveCreateTool,
  driveUpdateTool,
  bgListTool,
  bgStatusTool,
];

/**
 * Build the tool registry. With no args it registers every tool. Pass
 * `exclude` to omit tools by `schema.name` — a subagent excludes `delegate` so
 * it cannot recursively spawn further workers.
 * `mount_mcp` is registered via factory (needs a reference to the live registry).
 */
export function buildRegistry(opts?: { exclude?: string[] }): ToolRegistry {
  const registry = new ToolRegistry();
  const exclude = new Set(opts?.exclude ?? []);
  for (const tool of ALL_TOOLS) {
    if (!exclude.has(tool.schema.name)) registry.register(tool);
  }
  if (!exclude.has("mount_mcp")) {
    registry.register(buildMountMcpTool(registry));
  }
  return registry;
}

export { ToolRegistry } from "./registry.js";
