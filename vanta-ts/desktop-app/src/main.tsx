import React from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "./App";
import { CompanionApp } from "./companion";
import { ChatFirstShell } from "./chat-first-shell.js";
import { shellMode } from "./chat-first-navigation.js";
import "./styles.css";
import "./design/tokens.css";
import "./design/shell.css";
import "./design/workflows.css";
import "./design/messages.css";
import "./design/conversation.css";
import "./design/access-mode.css";
import "./design/full-access-warning.css";
import "./design/workflow-runs.css";
import "./design/streamlined-shell.css";
import "./design/primitives.css";
import "./design/chat-first-shell.css";
import "./design/chat-first-sidebar.css";
import "./design/chat-first-conversation.css";
import "./design/chat-first-workspaces.css";
import "./design/chat-workbench.css";
import "./librechat/presentation.css";
import "./librechat/tool-activity.css";
import "./design/reference-shell.css";
import { isNativeCompanion } from "./companion-client";
import { initializeDesktopTheme } from "./desktop-theme.js";

initializeDesktopTheme();
const Desktop = shellMode(window.location.search) === "classic" ? AppShell : ChatFirstShell;
const Root = window.location.pathname === "/companion" || isNativeCompanion() ? CompanionApp : Desktop;
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
