// F-094..F-113: the right-hand panes (Files, Review, Terminal, Browser) driven against the real native handlers.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { check, closeMenus, goHome, menuItems, notRun, pick, record, usable, verdict, waitUntil } from "./kit.mjs";
import { clearNativeLog, readNativeLog } from "./native-stubs.mjs";

const AREA = "right pane";
const git = (project, ...args) => execFileSync("git", args, { cwd: project, encoding: "utf8" });
const toggle = (page, id) => page.getByTestId(`titlebar-${id}`);

/** Click "Allow once" on every approval card until none is left; returns how many were answered. */
export async function allowApprovals(page, { max = 4, wait = 5000 } = {}) {
  let answered = 0;
  for (let i = 0; i < max; i++) {
    const allow = page.getByRole("button", { name: "Allow once" }).first();
    if (!(await allow.waitFor({ state: "visible", timeout: wait }).then(() => true, () => false))) break;
    await allow.click();
    answered++;
    await page.waitForTimeout(800);
  }
  return answered;
}

const PROBES = {
  browser: 'input[aria-label="Address"]',
  changes: 'text="Uncommitted"',
  files: 'button[aria-label="Collapse all folders"]',
  terminal: '[data-testid="terminal-gate-note"]'
};

// Files, Changes and Terminal toggles carry aria-pressed. The Browser toggle opens its pane but does not fold it
// again (toggleBrowserTab never sees the Vanta layout's tile as visible), so it is judged by its address field.
const isOpen = async (page, id) =>
  id === "browser" ? (await page.locator(PROBES.browser).count()) > 0 : (await toggle(page, id).getAttribute("aria-pressed")) === "true";

/** Open one pane and close the others, so a label that exists in two panes (Refresh tree) names one control. */
async function openPane(page, id) {
  for (const other of Object.keys(PROBES)) {
    if (other !== id && other !== "browser" && (await isOpen(page, other))) await toggle(page, other).click();
  }
  if (!(await isOpen(page, id))) await toggle(page, id).click();
  await page.waitForTimeout(1200);
}

/** The Files header's buttons appear on hover: hover the header, then press the button. */
async function pressHeaderButton(page, name) {
  await page.locator(".group\\/project-header").first().hover();
  await page.getByRole("button", { name }).first().click();
}

/** Per-row actions in the Review list show on hover: press `label` on the row that names `file`. */
async function pressRowButton(page, label, file) {
  const pressed = await page.evaluate(
    ({ label: wanted, file: name }) => {
      const selector = `button[aria-label="${wanted}"]`;
      for (const button of document.querySelectorAll(selector)) {
        // The row is the largest ancestor that still holds only this one button.
        let row = button.parentElement;
        while (row?.parentElement && row.parentElement.querySelectorAll(selector).length === 1) row = row.parentElement;
        if ((row?.textContent ?? "").includes(name)) {
          button.click();
          return true;
        }
      }
      return false;
    },
    { label, file }
  );
  if (!pressed) throw new Error(`no "${label}" button on the row for ${file}`);
}

export function dirtyProject(project) {
  fs.appendFileSync(path.join(project, "README.md"), "\nchanged line\n");
  fs.writeFileSync(path.join(project, "notes.txt"), "untracked\n");
}

export async function panesOpen(page) {
  for (const [id, probe] of [["files", PROBES.files], ["changes", PROBES.changes], ["terminal", PROBES.terminal]]) {
    await toggle(page, id).click();
    await page.waitForTimeout(900);
    const opened = (await page.locator(probe).count()) > 0 && (await isOpen(page, id));
    if (id !== "browser") await toggle(page, id).click();
    await page.waitForTimeout(400);
    record(`PANE-${id}`, AREA, `Titlebar toggle opens the ${id} pane`, opened ? "PASS" : "FAIL", opened ? "" : "pane did not open");
  }
  await page.keyboard.press("Meta+g");
  await page.waitForTimeout(700);
  const chord = (await page.locator('text="Uncommitted"').count()) > 0;
  record("F-094", AREA, "Workbench tabs and chords (⌘G opens Review)", chord ? "PASS" : "FAIL", "Files, Changes, Terminal and Browser toggles each open their pane");
  await toggle(page, "changes").click().catch(() => undefined);
}

export async function filesPane(page, app) {
  await openPane(page, "files");
  await check("F-095", AREA, "Files header: refresh, collapse, show ignored", page.getByRole("button", { name: "Refresh tree" }), { note: "buttons appear on hover; tree read through vanta:fs:read-dir, confined to the project" });
  await page.getByText("src", { exact: true }).last().click();
  await page.waitForTimeout(700);
  const listed = (await page.locator('[title$="src/index.ts"]').count()) > 0 && (await page.locator('[title$="README.md"]').count()) > 0;
  verdict("F-096", AREA, "File tree expands and lists project files", listed, { pass: "src/index.ts listed after expanding src; double-click opens the preview", why: "tree did not list the project files" });

  const row = page.locator('[title$="notes.txt"]').last();
  await clearNativeLog(app);
  await row.click({ button: "right" });
  await page.waitForTimeout(400);
  const items = await menuItems(page);
  await pick(page, "Reveal in Finder");
  await page.waitForTimeout(400);
  const revealed = (await readNativeLog(app)).revealed.some((file) => file.endsWith("notes.txt"));
  await row.click({ button: "right" });
  await pick(page, "Copy path");
  await page.waitForTimeout(300);
  const copied = (await page.evaluate(() => window.hermesDesktop.readClipboard())).endsWith("notes.txt");
  const has = (word) => items.some((item) => item.startsWith(word));
  verdict("F-097", AREA, "File menu: Reveal, Copy path, Rename, Delete", revealed && copied && has("Rename") && has("Delete"), {
    pass: `menu: ${items.join(" / ")}; Reveal reached the OS call, Copy path wrote the clipboard`,
    why: `revealed=${revealed} copied=${copied} items=${items.join(" / ")}`
  });
  await closeMenus(page);
}

export async function fileActions(page, app, project) {
  await openPane(page, "files");
  await pressHeaderButton(page, "Refresh tree");
  await page.waitForTimeout(800);
  await clearNativeLog(app);
  await page.locator('[title$="notes.txt"]').last().click({ button: "right" });
  await pick(page, "Rename");
  await page.waitForTimeout(400);
  await page.keyboard.press("Meta+a");
  await page.keyboard.type("renamed.txt");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  const asked = (await readNativeLog(app)).dialogs.some((d) => /Rename "notes.txt"/.test(d.message ?? ""));
  const renamed = fs.existsSync(path.join(project, "renamed.txt")) && !fs.existsSync(path.join(project, "notes.txt"));
  verdict("F-097R", AREA, "Rename asks in a native dialog naming the path, then renames on disk", asked && renamed, { why: `asked=${asked} renamed=${renamed}` });

  await pressHeaderButton(page, "Refresh tree");
  await page.waitForTimeout(900);
  await page.locator('[title$="renamed.txt"]').last().click({ button: "right" });
  await pick(page, "Delete");
  await page.waitForTimeout(500);
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForTimeout(1500);
  const trashed = (await readNativeLog(app)).trashed.some((file) => file.endsWith("renamed.txt"));
  verdict("F-097T", AREA, "Delete confirms in the app, asks again natively, then moves to the Trash", trashed, { pass: "Trash call received the real path (the OS Trash itself is stubbed in a hidden run)", why: "no Trash call after Delete" });
  fs.writeFileSync(path.join(project, "notes.txt"), "untracked\n");
  fs.rmSync(path.join(project, "renamed.txt"), { force: true });
}

export async function previewFile(page) {
  await openPane(page, "files");
  await page.locator('[title$="README.md"]').last().dblclick();
  await page.waitForTimeout(1500);
  const text = await page.locator("body").innerText();
  verdict("F-109", AREA, "File preview (SOURCE / PREVIEW, Edit)", /PREVIEW/.test(text) && /SOURCE/.test(text) && /Acme site/.test(text), {
    pass: "double-click opened README.md rendered, with SOURCE and Edit; saving needs writeTextFile (not wired)",
    why: "preview tab did not render the file"
  });
}

async function confirmDialog(page) {
  const confirm = page.getByRole("alertdialog").getByRole("button", { name: /revert|discard|confirm|yes/i }).first();
  const dialog = page.getByRole("dialog").getByRole("button", { name: /^(revert|discard)/i }).first();
  for (const button of [confirm, dialog]) {
    if (await button.isVisible({ timeout: 1500 }).catch(() => false)) {
      await button.click();
      return true;
    }
  }
  return false;
}

export async function reviewPane(page, project) {
  await openPane(page, "changes");
  const text = await page.locator("body").innerText();
  verdict("F-098", AREA, "Review pane: scope row and changed-file list", /Uncommitted/.test(text) && /Branch/.test(text) && /Last turn/.test(text) && /README\.md/.test(text) && /notes\.txt/.test(text), {
    pass: "lists README.md and notes.txt with +/- counts from vanta:git:review-list; scopes Uncommitted, Branch, Last turn",
    why: "scope row or file list missing"
  });
  await page.getByRole("button", { name: "Stage all" }).first().click();
  await page.waitForTimeout(2500);
  const staged = git(project, "diff", "--cached", "--name-only").trim().split("\n").sort().join(",");
  await pressRowButton(page, "Unstage", "notes.txt");
  await page.waitForTimeout(2500);
  const afterUnstage = git(project, "diff", "--cached", "--name-only").trim().split("\n").filter(Boolean).length;
  await pressRowButton(page, "Revert", "README.md");
  const confirmed = await confirmDialog(page);
  const cards = await allowApprovals(page, { max: 2 });
  const reverted = await waitUntil(() => !fs.readFileSync(path.join(project, "README.md"), "utf8").includes("changed line"));
  if (!reverted && process.env.PROOF_SHOTS) await page.screenshot({ path: `${process.env.PROOF_SHOTS}/f099.png` });
  verdict("F-099", AREA, "Stage all, Unstage, Revert through the gate", staged === "README.md,notes.txt" && afterUnstage === 1 && reverted, {
    pass: `stage all staged ${staged}; Unstage removed one; Revert put README.md back to the committed text (approval cards answered: ${cards}); the kernel decides whether a card appears`,
    why: `staged=${staged} afterUnstage=${afterUnstage} readmeReverted=${reverted} cards=${cards} dialogConfirmed=${confirmed}`
  });
}

export async function commitPane(page, project) {
  fs.writeFileSync(path.join(project, "notes.txt"), "untracked\n");
  fs.appendFileSync(path.join(project, "README.md"), "\ncommit me\n");
  await pressHeaderButton(page, "Refresh tree").catch(() => undefined);
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Stage all" }).first().click();
  await page.waitForTimeout(2200);
  await check("F-100P", AREA, "Create PR / Ask Vanta to open PR", page.getByRole("button", { name: /Ask Vanta to open PR/ }), { inert: "Create PR needs gh and a network call: refused with a message, never faked; Ask Vanta to open PR hands it to the chat" });
  await page.getByPlaceholder(/Message/).fill("proof commit");
  await page.getByRole("button", { name: /^Commit$/ }).first().click();
  await page.waitForTimeout(500);
  const cards = await allowApprovals(page, { max: 2 });
  await page.waitForTimeout(2500);
  const subject = git(project, "log", "-1", "--format=%s").trim();
  verdict("F-100", AREA, "Ship bar: message, Commit", subject === "proof commit", {
    pass: `Commit created a real commit "${subject}" through vanta:git:mutate (approval cards answered: ${cards})`,
    why: `last commit is "${subject}"`
  });
}

export async function terminalPane(page) {
  await goHome(page);
  await page.locator('[data-tour="sessions-sidebar"]').first().getByText("Say hello", { exact: true }).first().click();
  await page.waitForTimeout(800);
  await openPane(page, "terminal");
  await check("F-101", AREA, "Terminal pane with a tab rail and New terminal", page.getByRole("button", { name: "New terminal" }), { note: "line terminal, no pty" });
  const note = await page.getByTestId("terminal-gate-note").innerText().catch(() => "");
  verdict("F-101N", AREA, "Terminal says every command asks for approval", /approval/.test(note), { pass: note, why: "no approval note in the pane" });
  await page.locator(".xterm").first().click({ force: true });
  await page.keyboard.type("echo proof-terminal");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3500);
  const screen = await page.locator(".xterm-rows").first().innerText().catch(() => "");
  verdict("F-101R", AREA, "A command typed in the terminal runs and prints", /proof-terminal/.test(screen), { pass: "echo ran through the gate and printed", why: `screen: ${screen.slice(-120)}` });
  await page.keyboard.type("curl -s https://example.com");
  await page.keyboard.press("Enter");
  const card = await page.getByText("Run a command").first().waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
  verdict("F-101A", AREA, "An egress command shows an approval card in the chat", card, { pass: "card 'Run a command' appeared in the chat in front", why: "no approval card" });
  await page.getByRole("button", { name: "Reject" }).first().click().catch(() => undefined);
  await page.waitForTimeout(1500);
}

export async function browserPane(page) {
  await openPane(page, "browser");
  record("PANE-browser", AREA, "Titlebar toggle opens the browser pane", (await page.locator(PROBES.browser).count()) > 0 ? "PASS" : "FAIL", "it opens once; it does not fold again from the toggle (use the pane's close button)");
  const controls = ["Back", "Forward", "Reload page", "Copy URL", "Annotate", "Pop out", "Show preview console", "Open preview DevTools"];
  const present = [];
  for (const name of controls) if ((await page.getByRole("button", { name, exact: true }).count()) > 0) present.push(name);
  const address = page.getByLabel("Address");
  await address.fill("http://127.0.0.1:9/");
  await address.press("Enter");
  await page.waitForTimeout(1500);
  const blank = /Type an address above to browse/.test(await page.locator("body").innerText());
  record("F-105", AREA, "Browser pane: address, back, forward, reload", present.length >= 4 && (await usable(address)) ? "INERT" : "FAIL", `controls present: ${present.join(", ")}. The pane stays blank after Enter: the page host (webviewTag) is switched off in the Vanta shell, so nothing can browse yet`);
  record("F-106", AREA, "Preview console and DevTools", present.includes("Show preview console") ? "INERT" : "FAIL", "buttons present; they act on a loaded page, and no page loads (webviewTag off)");
  record("F-107", AREA, "Annotate mode", present.includes("Annotate") ? "INERT" : "FAIL", "toolbar button present; needs a loaded page");
  record("F-108", AREA, "Restart-server prompt / file-change reload", blank ? "INERT" : "FAIL", "error state only shows for a loaded page; file watching is wired (vanta:fs:watch-file) and tested in main");
  record("F-111", AREA, "Real-browser-profile consent dialog", "NOT-RUN", "appears only when a browser tool asks for the real profile; Vanta brokers logins instead (Settings > Passwords & Logins)");
  await toggle(page, "browser").click();
  await page.waitForTimeout(400);
}

export async function tabsAndOverlays(page) {
  await goHome(page);
  await page.keyboard.press("Meta+t");
  await page.waitForTimeout(900);
  const tabs = await page.locator("[role=tab]").allInnerTexts();
  verdict("F-112", AREA, "Tab strip shows once a second tab exists (⌘T)", tabs.length >= 4 && tabs.some((t) => /Untitled session/.test(t)), { pass: `tabs: ${tabs.join(" / ")}`, why: `tabs: ${tabs.join(" / ")}` });
  await page.keyboard.press("Meta+w");
  await page.waitForTimeout(500);
}

export async function narrow(page, app) {
  await app.resize(1100, 800);
  const rail = await page.getByTestId("sidebar-settings").first().boundingBox();
  await app.resize(900, 700);
  const drawer = (await page.getByTestId("titlebar-sidebar").count()) > 0;
  await app.resize(1440, 900);
  record("F-113", AREA, "Narrow-width: sidebar rail at 1100, drawer button at 900", rail && rail.x + rail.width < 120 && drawer ? "PASS" : "FAIL", `at 1100 the sidebar is an icon rail (settings gear at x=${Math.round(rail?.x ?? -1)}); the sidebar toggle is present at 900 = ${drawer}`);
}

export function paneRows() {
  notRun("F-103", AREA, "Agent terminal tabs (read-only output)", "needs typed background-process events from the server (DN-06); no agent command is backgrounded in the canned model");
  notRun("F-110", AREA, "Artifact preview (versions pager)", "needs a saved artifact; see the Outputs page row F-230");
}
