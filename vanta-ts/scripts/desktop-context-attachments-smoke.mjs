import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright-core";

const project = await mkdtemp(join(tmpdir(), "vanta-desktop-context-project-"));
const userData = await mkdtemp(join(tmpdir(), "vanta-desktop-context-profile-"));
const executablePath = process.env.VANTA_DESKTOP_APP;
const longPath = "src/a-deeply-nested-feature/with-a-very-long-directory-name/context-implementation.ts";
const files = ["README.md", "src/App.tsx", "src/chat.tsx", longPath];
const droppedFile = join(project, "drop-one.md");
const droppedFolder = join(project, "drop-folder");
const shiftedFile = join(project, "shift-drop.md");
const pickedFile = join(project, "picked-from-dialog.md");
let app;
const submissions = [];

try {
  await mkdir(droppedFolder);
  await writeFile(droppedFile, "one");
  await writeFile(shiftedFile, "shifted");
  await writeFile(pickedFile, "picked");
  await writeFile(join(droppedFolder, "nested.md"), "nested");
  await writeFile(join(droppedFolder, ".env"), "must-not-attach");
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? ["--project", project] : ["desktop-app/electron/main.mjs", "--project", project],
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
    submissions.push(JSON.parse(route.request().postData() ?? "{}"));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ finalText: "Context received.", events: [] }) });
  });
  await page.setViewportSize({ width: 760, height: 700 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const composer = document.querySelector("#vanta-composer");
    return composer instanceof HTMLTextAreaElement && !composer.disabled;
  });

  const composer = page.getByPlaceholder("Ask Vanta to do something...");
  await composer.fill("Review src/chat.tsx");
  const openInspector = page.getByRole("button", { name: "Open contextual inspector" });
  if (await openInspector.isVisible().catch(() => false)) await openInspector.click();
  const filesTab = page.locator(".inspector-tabs button").filter({ hasText: "Files" });
  if (!await filesTab.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Review", exact: true }).click();
  }
  await filesTab.click();
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

  await page.getByRole("dialog", { name: "Review" }).getByRole("button", { name: "Close review" }).click();
  await page.getByRole("button", { name: "Remove src/chat.tsx" }).click();

  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, pickedFile);
  await page.getByRole("button", { name: "Attach files or folders" }).click();
  await page.getByLabel("Attached project context").getByText("picked-from-dialog.md").waitFor();

  const composerBox = await page.locator(".composer").boundingBox();
  assert.ok(composerBox, "composer geometry unavailable for native drag");
  const cdp = await page.context().newCDPSession(page);
  const dragData = { items: [], files: [droppedFile, droppedFolder], dragOperationsMask: 1 };
  const dragPoint = { x: composerBox.x + composerBox.width / 2, y: composerBox.y + composerBox.height / 2 };
  await cdp.send("Input.dispatchDragEvent", { type: "dragEnter", ...dragPoint, data: dragData });
  await page.locator('.composer[data-drop-active="true"]').waitFor();
  await page.getByText("Drop files or folders to attach").waitFor();
  await cdp.send("Input.dispatchDragEvent", { type: "dragOver", ...dragPoint, data: dragData });
  await cdp.send("Input.dispatchDragEvent", { type: "drop", ...dragPoint, data: dragData });
  await page.getByLabel("Attached project context").getByText("drop-one.md").waitFor();
  await page.getByLabel("Folder drop-folder with 1 readable file").waitFor();
  assert.equal(await page.getByLabel("Attached project context").getByText("drop-folder/nested.md").count(), 0, "folder contents leaked into individual chips");
  assert.equal(await page.locator(".folder-context-chip").count(), 1, "folder drop did not render as one compact chip");
  if (process.env.VANTA_DESKTOP_CONTEXT_SCREENSHOT) {
    await page.screenshot({ path: process.env.VANTA_DESKTOP_CONTEXT_SCREENSHOT });
  }
  await page.locator('.composer[data-drop-active="false"]').waitFor();
  assert.equal(await page.getByLabel("Attached project context").getByText(".env").count(), 0, "private file was attached");
  const shiftedData = { items: [], files: [shiftedFile], dragOperationsMask: 1 };
  await cdp.send("Input.dispatchDragEvent", { type: "dragEnter", ...dragPoint, data: shiftedData, modifiers: 8 });
  await cdp.send("Input.dispatchDragEvent", { type: "drop", ...dragPoint, data: shiftedData, modifiers: 8 });
  await page.getByLabel("Attached project context").getByText("shift-drop.md").waitFor();

  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("Context received.").waitFor();
  const submitted = submissions[0];
  assert.match(submitted.message, /Review src\/chat\.tsx/);
  assert.match(submitted.message, /@src\/App\.tsx/);
  assert.match(submitted.message, new RegExp(`@${longPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(submitted.message, /@drop-one\.md/);
  assert.match(submitted.message, /@drop-folder\/nested\.md/);
  assert.match(submitted.message, /@shift-drop\.md/);
  assert.match(submitted.message, /@picked-from-dialog\.md/);
  assert.doesNotMatch(submitted.message, /@src\/chat\.tsx/);
  assert.deepEqual(submitted.files.sort(), ["drop-folder/nested.md", "drop-one.md", longPath, "picked-from-dialog.md", "shift-drop.md", "src/App.tsx"].sort());

  await page.locator(".context-chips").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Attach files or folders" }).click();
  await page.getByLabel("Attached project context").getByText("picked-from-dialog.md").waitFor();
  assert.equal(await composer.inputValue(), "", "file-only task unexpectedly inserted draft text");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("Context received.").nth(1).waitFor();
  const fileOnly = submissions[1];
  assert.equal(fileOnly.message, "Review the attached files.\n@picked-from-dialog.md");
  assert.deepEqual(fileOnly.files, ["picked-from-dialog.md"]);

  console.log(JSON.stringify({ groups: true, nativePicker: true, dragFile: true, shiftDrag: true, dragFolder: true, folderIconChip: true, privateSkipped: true, fileOnlySubmit: true, attach: true, remove: true, search: true, submitRefs: true, viewport: "760x700", geometry }));
} finally {
  await app?.close().catch(() => undefined);
  await Promise.all([rm(project, { recursive: true, force: true }), rm(userData, { recursive: true, force: true })]);
}
