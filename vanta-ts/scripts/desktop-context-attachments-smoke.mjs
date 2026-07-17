import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright-core";

const project = await mkdtemp(join(tmpdir(), "vanta-desktop-context-project-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-context-profile-"));
const longPath = "src/a-deeply-nested-feature/with-a-very-long-directory-name/context-implementation.ts";
const files = ["README.md", "src/App.tsx", "src/chat.tsx", longPath];
let app;
let submitted = "";

try {
  app = await electron.launch({
    args: ["desktop-app/electron/main.mjs"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      VANTA_PROJECT_ROOT: project,
      VANTA_DESKTOP_USER_DATA: userData,
      VANTA_DESKTOP_PORT: process.env.VANTA_DESKTOP_SMOKE_PORT ?? "7827",
      VANTA_DESKTOP_AUTOMATION: "1",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "vanta-context-smoke-key",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20_000);
  await page.route("**/api/files", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(files) }));
  await page.route("**/api/file-context", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ files, changed: ["src/App.tsx"], recent: ["README.md", longPath, "src/chat.tsx"] }),
  }));
  await page.route("**/api/chat", (route) => {
    submitted = JSON.parse(route.request().postData() ?? "{}").message ?? "";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ finalText: "Context received.", events: [] }) });
  });
  await page.setViewportSize({ width: 760, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });

  const composer = page.getByPlaceholder("Ask Vanta to do something...");
  await composer.fill("Review src/chat.tsx");
  await page.getByRole("button", { name: "Attach project files" }).click();
  const panel = page.locator(".files-panel");
  await panel.getByText("Changed by Vanta").waitFor();
  await panel.getByText("Mentioned in this task").waitFor();
  await panel.getByText("Recent").waitFor();

  await panel.getByTitle("src/App.tsx").click();
  await panel.getByTitle("src/chat.tsx").click();
  await page.getByLabel("Attached project context").getByText("src/App.tsx").waitFor();
  await page.getByLabel("Attached project context").getByText("src/chat.tsx").waitFor();
  await panel.getByText("2 attached").waitFor();

  await panel.getByPlaceholder("Find a project file").fill("deeply");
  await panel.getByText("Search project").waitFor();
  await panel.getByTitle(longPath).click();
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector(".files-panel");
    const chips = document.querySelector(".context-chips");
    if (!panel || !chips) throw new Error("context surfaces missing");
    return { panel: [panel.clientWidth, panel.scrollWidth], chips: [chips.clientWidth, chips.scrollWidth] };
  });
  assert.ok(geometry.panel[1] <= geometry.panel[0], `file panel overflowed: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.chips[1] <= geometry.chips[0], `context chips overflowed: ${JSON.stringify(geometry)}`);

  await page.getByRole("button", { name: "Remove src/chat.tsx" }).click();
  await page.getByRole("button", { name: "Close inspector" }).click();
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("Context received.").waitFor();
  assert.match(submitted, /Review src\/chat\.tsx/);
  assert.match(submitted, /@src\/App\.tsx/);
  assert.match(submitted, new RegExp(`@${longPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.doesNotMatch(submitted, /@src\/chat\.tsx/);

  console.log(JSON.stringify({ groups: true, attach: true, remove: true, search: true, submitRefs: true, viewport: "760x900", geometry }));
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([rm(project, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })]);
}
