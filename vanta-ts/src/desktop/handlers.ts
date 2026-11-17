// Stable Desktop handler facade; implementation is grouped by responsibility.
export { approvalDecision, type PendingApproval } from "./approval.js";
export { type DesktopEvent, type DesktopState } from "./handler-state.js";
export { readJson, sendJson } from "./handler-http.js";
export { eventLabel } from "./handler-conversation.js";
export { handleStatus, handleTelegramSetupStatus, handleAccessMode, handleRuntime, handleTools, handleCapabilities, handleMessaging, handleSaveMessaging, handleConnectTest, handleGatewayStart, handleArtifacts, handleFiles, handleFileContext, handleCanvas } from "./handler-status.js";
export { handleRuns, handleRunAction } from "./handler-runs.js";
export { handleSessions, handleNewSession, handleOpenSession, handleRenameSession, handleArchiveSession, handlePinSession, handleReorderPinnedSessions, handleDeleteSession, handleBulkSessions } from "./handler-sessions.js";
export { type DesktopProviderOption, desktopProviderOptions, type DesktopCatalogLoader, loadDesktopProviderCatalog, type DesktopModelDiscoverer, desktopProviderOptionsLive } from "./handler-provider-catalog.js";
export { resolveDesktopProviderSelection, handleModels, handleSetModel, handleModelSettings } from "./handler-models.js";
export { handleApproval, handleTerminal } from "./handler-approval.js";
export { handleQueueList, handleSessionDraft, handleQueueChat } from "./handler-queue.js";
export { handleStopChat, handleChat } from "./handler-chat.js";
