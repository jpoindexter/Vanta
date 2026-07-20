import React from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "./App";
import { CompanionApp } from "./companion";
import "./styles.css";
import "./design/tokens.css";
import "./design/shell.css";
import "./design/workflows.css";
import "./design/messages.css";
import "./design/conversation.css";
import "./design/access-mode.css";
import "./design/full-access-warning.css";
import "./design/workflow-runs.css";
import { isNativeCompanion } from "./companion-client";

const Root = window.location.pathname === "/companion" || isNativeCompanion() ? CompanionApp : AppShell;
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
