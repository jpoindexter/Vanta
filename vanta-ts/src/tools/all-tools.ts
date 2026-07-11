import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { shellCmdTool } from "./shell-cmd.js";
import { inspectStateTool } from "./inspect-state.js";
import { inspectContextTool } from "./inspect-context.js";
import { codeContextTool } from "./code-context.js";
import { codeSearchTool } from "./code-search.js";
import { codeAffectedTool } from "./code-affected.js";
import { codeIndexTool } from "./code-index.js";
import { clarifyTool } from "./clarify.js";
import { askUserTool } from "./ask-user.js";
import { terminalCaptureTool } from "./terminal-capture-tool.js";
import { voiceInputTool } from "./voice-input-tool.js";
import { roadmapMoveTool } from "./roadmap-move.js";
import { roadmapAddTool } from "./roadmap-add.js";
import { webSearchTool } from "./web-search.js";
import { webFetchTool } from "./web-fetch.js";
import { writeSkillTool } from "./write-skill.js";
import { skillManageTool } from "./skill-manage.js";
import { recallTool } from "./recall.js";
import { researchDecomposeTool } from "./research-decompose.js";
import { screenshotTool } from "./screenshot.js";
import { browserNavigateTool } from "./browser-navigate.js";
import { browserExtractTool } from "./browser-extract.js";
import { browserActTool } from "./browser-act.js";
import { visionActionTool } from "./vision-action.js";
import { visionWatchTool } from "./vision-watch.js";
import { browserReadTool } from "./browser-read.js";
import { describeImageTool } from "./describe-image.js";
import { distillTraceTool } from "./distill-trace.js";
import { compareVisionTool } from "./compare-vision.js";
import { lookAtScreenTool } from "./look-at-screen.js";
import { lookAtCameraTool } from "./look-at-camera.js";
import { brainTool } from "./brain.js";
import { todoTool } from "./todo.js";
import { worldTool } from "./world.js";
import { moneyTool } from "./money.js";
import { tasteCritiqueTool } from "./taste-critique.js";
import { radarTool } from "./radar.js";
import { reachTool } from "./reach-tool.js";
import { teamTool } from "./team.js";
import { lifeSearchTool } from "./life-search.js";
import { linkedinReadTool } from "./linkedin-read.js";
import { redditReadTool } from "./reddit-read.js";
import { regressionLockTool } from "./regression-lock.js";
import { reviewArtifactTool } from "./review-artifact.js";
import { ticketTool } from "./tickets.js";
import { outreachTool } from "./outreach.js";
import { selfCorrectTool } from "./self-correct.js";
import { configSandboxTool } from "./config-sandbox.js";
import { budgetTool } from "./budget.js";
import { nlAssertionsTool } from "./nl-assertions.js";
import { rssReadTool } from "./rss-read.js";
import { lanDiscoverTool } from "./lan-discover.js";
import { lanControlTool } from "./lan-control.js";
import { selfRepairTool } from "./self-repair.js";
import { watchVideoTool } from "./watch-video.js";
import { speakTool } from "./speak.js";
import { swarmTool } from "./swarm.js";
import { councilTool } from "./council.js";
import { generateAgentTool } from "./generate-agent.js";
import { transcribeTool } from "./transcribe.js";
import { twitterReadTool } from "./twitter-read.js";
import { youtubeReadTool } from "./youtube.js";
import { githubReadTool } from "./github-read.js";
import { podcastReadTool } from "./podcast.js";
import { v2exReadTool } from "./v2ex-read.js";
import { bilibiliReadTool } from "./bilibili-read.js";
import { xueqiuReadTool } from "./xueqiu-read.js";
import { xiaohongshuReadTool } from "./xiaohongshu-read.js";
import { runCodeTool } from "./run-code.js";
import { maximizerTool } from "./maximizer.js";
import {
  lspDiagnosticsTool,
  lspDefinitionTool,
  lspReferencesTool,
  lspSymbolsTool,
  lspHoverTool,
} from "./lsp.js";
import {
  gitStatusTool,
  gitDiffTool,
  gitCommitTool,
  gitPushTool,
  gitBranchTool,
  gitCheckoutTool,
} from "./git.js";
import { delegateTool } from "./delegate.js";
import { callAgentTool } from "./call-agent.js";
import { agentSessionTool } from "./agent-session.js";
import { buildWithAgentTool } from "./build-with-agent.js";
import { workflowTool } from "./workflow.js";
import { bgListTool, bgStatusTool } from "./bg-tasks.js";
import { refIngestTool, refSearchTool, refListTool } from "./ref-ingest.js";
import { editFileTool } from "./edit-file.js";
import { pdfReadTool } from "./pdf-read.js";
import { grepFilesTool } from "./grep-files.js";
import { globFilesTool } from "./glob-files.js";
import { protectTool } from "./protect.js";
import { graphQueryTool } from "./graph-query.js";
import { sleepTool } from "./sleep.js";
import { cronCreateTool, cronListTool } from "./cron.js";
import { configTool } from "./config.js";
import { configToolTool } from "./config-tool.js";
import { cookieImportTool } from "./cookie-import.js";
import { briefTool } from "./brief.js";
import { listMcpResourcesTool, readMcpResourceTool } from "./mcp-resources.js";
import { retrieveOriginalTool } from "./retrieve-original.js";
import { loopTool } from "./loop.js";
import { sendMessageTool } from "./send-message.js";
import { sendChatTool } from "./send-chat.js";
import { playbookTool } from "./playbook.js";
import { enterWorktreeTool, exitWorktreeTool } from "./worktree.js";
import { listPeersTool, peerSendTool } from "./peers.js";
import { openDeepLinkTool } from "./deep-link.js";
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
import { googleAuthTool } from "./google-auth.js";
import { marketingReadTool } from "./marketing-read.js";
import { renderCanvasTool } from "./render-canvas.js";
import { spreadsheetWorkbookTool } from "./spreadsheet-workbook.js";
import { mediaStudioTool } from "./media-studio.js";
import { paymentTransactionTool } from "./payment-transaction.js";
import { shopifyOperationsTool } from "./shopify-operations.js";
import type { Tool } from "./types.js";

/**
 * Every tool the agent can use, in registration order. Kept as an array (rather
 * than registered inline) so {@link buildRegistry} can filter by name before
 * registering — used to give a subagent a registry without `delegate`.
 */
export const ALL_TOOLS: readonly Tool[] = [
  readFileTool,
  editFileTool,
  writeFileTool,
  pdfReadTool,
  grepFilesTool,
  globFilesTool,
  shellCmdTool,
  inspectStateTool,
  inspectContextTool,
  codeContextTool,
  codeSearchTool,
  codeAffectedTool,
  codeIndexTool,
  clarifyTool,
  askUserTool,
  terminalCaptureTool,
  voiceInputTool,
  configTool,
  configToolTool,
  cookieImportTool,
  cronCreateTool,
  cronListTool,
  sleepTool,
  roadmapMoveTool,
  roadmapAddTool,
  webSearchTool,
  webFetchTool,
  writeSkillTool,
  skillManageTool,
  recallTool,
  researchDecomposeTool,
  redditReadTool,
  screenshotTool,
  browserNavigateTool,
  browserExtractTool,
  browserActTool,
  visionActionTool,
  visionWatchTool,
  browserReadTool,
  describeImageTool,
  distillTraceTool,
  compareVisionTool,
  lookAtScreenTool,
  lookAtCameraTool,
  brainTool,
  briefTool,
  todoTool,
  worldTool,
  moneyTool,
  tasteCritiqueTool,
  radarTool,
  reachTool,
  teamTool,
  lifeSearchTool,
  linkedinReadTool,
  regressionLockTool,
  reviewArtifactTool,
  ticketTool,
  outreachTool,
  selfCorrectTool,
  configSandboxTool,
  budgetTool,
  nlAssertionsTool,
  rssReadTool,
  lanDiscoverTool,
  lanControlTool,
  selfRepairTool,
  watchVideoTool,
  speakTool,
  swarmTool,
  councilTool,
  generateAgentTool,
  workflowTool,
  graphQueryTool,
  transcribeTool,
  twitterReadTool,
  youtubeReadTool,
  githubReadTool,
  podcastReadTool,
  v2exReadTool,
  bilibiliReadTool,
  xueqiuReadTool,
  xiaohongshuReadTool,
  runCodeTool,
  maximizerTool,
  lspDiagnosticsTool,
  lspDefinitionTool,
  lspReferencesTool,
  lspSymbolsTool,
  lspHoverTool,
  listMcpResourcesTool,
  readMcpResourceTool,
  gitStatusTool,
  gitDiffTool,
  gitCommitTool,
  gitPushTool,
  gitBranchTool,
  gitCheckoutTool,
  delegateTool,
  callAgentTool,
  agentSessionTool,
  buildWithAgentTool,
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
  googleAuthTool,
  marketingReadTool,
  renderCanvasTool,
  mediaStudioTool,
  paymentTransactionTool,
  shopifyOperationsTool,
  spreadsheetWorkbookTool,
  bgListTool,
  bgStatusTool,
  refIngestTool,
  refSearchTool,
  refListTool,
  protectTool,
  retrieveOriginalTool,
  loopTool,
  sendMessageTool,
  sendChatTool,
  playbookTool,
  enterWorktreeTool,
  exitWorktreeTool,
  listPeersTool,
  peerSendTool,
  openDeepLinkTool,
];
