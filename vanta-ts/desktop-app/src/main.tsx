import React from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "./App";
import { CompanionApp } from "./companion";
import "./styles.css";
import { isNativeCompanion } from "./companion-client";

const Root = window.location.pathname === "/companion" || isNativeCompanion() ? CompanionApp : AppShell;
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
