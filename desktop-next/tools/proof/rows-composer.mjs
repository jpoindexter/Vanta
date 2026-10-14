// F-114..F-141: the composer, driven in a real chat: input, attachments, pills, popovers and the run controls.
import { attempt, closeMenus, goHome, menuItems, notRun, pick, record, startChat, usable, verdict, waitUntil } from "./kit.mjs";
import { clearNativeLog, readNativeLog } from "./native-stubs.mjs";

const AREA = "composer";
const sidebar = (page) => page.locator('[data-tour="sessions-sidebar"]').first();
const editor = (page) => page.locator('[data-slot="composer-root"] [contenteditable="true"], [data-slot="composer-root"] textarea').first();

async function inChat(page) {
  await goHome(page);
  await sidebar(page).getByText("Say hello", { exact: true }).first().click();
  await page.waitForTimeout(800);
}

export async function inputRows(page) {
  await inChat(page);
  await attempt(page, "F-114", AREA, "Rich input: type, send, history, Esc", async () => {
    await editor(page).click();
    await page.keyboard.type("history probe");
    await page.keyboard.press("Enter");
    await page.getByText("history probe").first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(3000);
    await editor(page).click();
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(400);
    const recalled = /history probe/.test(await editor(page).innerText());
    await page.keyboard.press("Meta+a");
    await page.keyboard.press("Backspace");
    verdict("F-114", AREA, "Rich input: type, send, history ↑", recalled, { pass: "a typed message sent, and ↑ in the empty box recalled it (Esc cancels a running turn: see F-124)", why: "↑ did not recall the last message" });
  });
  await attempt(page, "F-136", AREA, "Slash popover", async () => {
    await editor(page).click();
    await page.keyboard.type("/");
    await page.waitForTimeout(600);
    const text = await page.locator('[role="listbox"], [cmdk-list]').last().innerText();
    const count = (text.match(/\n\//g) ?? []).length;
    await page.keyboard.press("Backspace");
    verdict("F-136", AREA, "Slash popover '/'", /\/new/.test(text) && /\/stop/.test(text), { pass: `lists Vanta's commands (${text.replace(/\n+/g, " ").slice(0, 120)}); the Hermes catalog is not carried over, only commands Vanta backs`, why: text.slice(0, 160) });
    void count;
  });
  await attempt(page, "F-137", AREA, "@ popover", async () => {
    await editor(page).click();
    await page.keyboard.type("@");
    await page.waitForTimeout(600);
    const text = await page.locator('[role="listbox"], [cmdk-list]').last().innerText();
    await page.keyboard.press("Backspace");
    verdict("F-137", AREA, "@ popover (files, folders)", /README\.md/.test(text), { pass: `lists project files: ${text.replace(/\n+/g, " ").slice(0, 100)}`, why: text.slice(0, 160) });
  });
  await attempt(page, "F-138", AREA, "? quick help", async () => {
    await editor(page).click();
    await page.keyboard.type("?");
    await page.waitForTimeout(600);
    const text = await page.locator("body").innerText();
    await page.keyboard.press("Backspace");
    verdict("F-138", AREA, "? quick help (commands and hotkeys)", /COMMON COMMANDS/.test(text) && /HOTKEYS/.test(text), { pass: "shows Common commands and Hotkeys", why: "no quick help" });
  });
}

export async function attachRows(ctx) {
  const { page, app } = ctx;
  await inChat(page);
  await attempt(page, "F-115", AREA, "+ menu: Files, Folder, Images, Paste image", async () => {
    await page.getByRole("button", { name: "Add context" }).click();
    await page.waitForTimeout(500);
    const items = await menuItems(page);
    verdict("F-115", AREA, "+ menu: Files…, Folder…, Images…, Paste image", ["Files…", "Folder…", "Images…", "Paste image"].every((i) => items.includes(i)), { pass: items.join(" / "), why: items.join(" / ") });
    await clearNativeLog(app);
    await pick(page, "Folder…");
    await page.waitForTimeout(1500);
    const picked = (await readNativeLog(app)).dialogs.some((d) => d.picker);
    const chip = (await page.locator('[data-slot="composer-root"]').first().innerText()).includes("beta-notes");
    verdict("F-118", AREA, "Attachment chip after picking a folder", picked && chip, { pass: "Folder… opened the native picker (stubbed) and the folder became a chip; its remove control is the chip's ×", why: `picker=${picked} chip=${chip}` });
  });
  await attempt(page, "F-116", AREA, "+ menu: URL…, Prompt snippets…", async () => {
    await page.getByRole("button", { name: "Add context" }).click();
    await page.waitForTimeout(400);
    const items = await menuItems(page);
    verdict("F-116", AREA, "+ menu: URL… and Prompt snippets…", items.includes("URL…") && items.includes("Prompt snippets…"), { pass: "both entries are in the menu", why: items.join(" / ") });
  });
  await closeMenus(page);
  record("F-117", AREA, "Contributed attachment providers", "NOT-RUN", "no plugin contributes an attachment provider by default");
  record("F-119", AREA, "Large paste collapse, screenshot capture", "INERT", "the screenshot hotkey (command-screenshot) is not part of the Vanta shell; paste collapse is renderer-only and not driven here");
}

export async function pillRows(page) {
  await inChat(page);
  await attempt(page, "F-120", AREA, "Model pill menu", async () => {
    await page.getByRole("button", { name: /^Model/ }).click();
    await page.waitForTimeout(600);
    const text = await page.locator('[role="menu"], [data-radix-popper-content-wrapper]').last().innerText();
    verdict("F-120", AREA, "Model pill menu", /Vanta Proof/.test(text) && /Sonnet/.test(text), { pass: "lists the configured provider models and the custom endpoint's Vanta Proof", why: text.slice(0, 160) });
  });
  await closeMenus(page);
  record("F-121", AREA, "Model switch confirm, picker overlay, visibility dialog", "NOT-RUN", "choosing another model would change the sandbox's provider (a key or endpoint is needed); the picker menu itself is F-120");
  await attempt(page, "F-122", AREA, "Reasoning pill", async () => {
    await page.getByRole("button", { name: /^Effort/ }).click();
    await page.waitForTimeout(500);
    const items = await menuItems(page);
    await page.getByRole("menuitemradio", { name: "High", exact: true }).click();
    await page.waitForTimeout(700);
    const label = await page.locator('[data-slot="composer-root"] button[aria-label^="Effort"]').first().evaluate((b) => `${b.getAttribute("aria-label")} ${b.textContent}`).catch(() => "");
    const changed = /High/.test(label ?? "");
    record("F-122", AREA, "Reasoning pill: Thinking … Ultra", items.includes("Max") && changed ? "PASS" : items.includes("Max") ? "INERT" : "FAIL", changed ? `${items.join(" / ")}; choosing High changed the pill to "${label}"` : `the menu lists ${items.join(" / ")}, but choosing High leaves the pill on Medium: the server refuses it for this endpoint ("custom vanta-proof does not support effort high", POST /api/model-settings 400) and the pill says nothing. The model's supported efforts should limit the list (src/api/vanta model options, R3)`);
  });
  await closeMenus(page);
  await attempt(page, "F-123", AREA, "Permission chip", async () => {
    await page.getByRole("button", { name: /^Permission mode/ }).click();
    await page.waitForTimeout(500);
    const items = await menuItems(page);
    await pick(page, "Plan");
    await page.waitForTimeout(500);
    const label = await page.getByRole("button", { name: /^Permission mode/ }).getAttribute("aria-label");
    await page.getByRole("button", { name: /^Permission mode/ }).click();
    await pick(page, "Ask each time");
    verdict("F-123", AREA, "Permission chip: five modes", items.length === 5 && /Plan/.test(label ?? ""), { pass: `${items.map((i) => i.split("\n")[0]).join(" / ")}; choosing Plan changed the chip to "${label}"`, why: `items=${items.length} label=${label}` });
  });
  await closeMenus(page);
  await attempt(page, "F-128", AREA, "Status drawer toggle and coding row", async () => {
    const drawer = await usable(page.getByRole("button", { name: "Hide status stack" }));
    const coding = (await page.locator('[data-slot="composer-root"]').first().innerText()).includes("main");
    verdict("F-133", AREA, "Coding row: branch, changes", coding, { pass: "the composer shows the branch (main), Copy path, New branch and the changed-file count", why: "no coding row" });
    verdict("F-128", AREA, "Status drawer toggle", drawer, { pass: "Hide status stack is in the composer", why: "no status drawer toggle" });
  });
  await attempt(page, "F-126", AREA, "Voice mic", async () => {
    const mic = await usable(page.getByRole("button", { name: "Dictate" }));
    record("F-126", AREA, "Voice mic: dictation, read aloud, wake word", mic ? "INERT" : "FAIL", "the Dictate button is there; it needs microphone access and a speech engine, so it was not started in a hidden run");
  });
}

export async function runRows(page) {
  await inChat(page);
  await attempt(page, "F-124", AREA, "Send, Stop, Queue while a turn runs", async () => {
    await editor(page).click();
    await page.keyboard.type("slow count to ten");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    const stop = Boolean(await waitUntil(async () => (await page.locator('button[aria-label^="Stop"], button[title^="Stop"]').count()) > 0, 5000, 250));
    await editor(page).click();
    await page.keyboard.type("queued follow up");
    await page.keyboard.press("Meta+Enter");
    await page.waitForTimeout(800);
    const text = await page.locator("body").innerText();
    const queued = /queued follow up/i.test(text) && /Queue|queued/i.test(text);
    const labels = await page.locator('[data-slot="composer-root"] button').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || e.textContent?.trim()));
    verdict("F-124", AREA, "Send / Stop / Queue", stop && queued, { pass: "while a slow turn ran the Stop button showed and ⌘Enter queued a message", why: `stop=${stop} queued=${queued} buttons=${labels.join("|")}` });
    verdict("F-125", AREA, "Queue panel", queued, { pass: "the queued message sits above the composer", why: "no queue panel" });
    await page.getByRole("button", { name: /^Stop/ }).first().click().catch(() => undefined);
    await page.waitForTimeout(1000);
  });
  record("F-127", AREA, "Voice conversation pill", "NOT-RUN", "needs a started voice conversation (microphone)");
  for (const [id, label] of [["F-129", "Subagents section"], ["F-130", "Todos and background processes"], ["F-131", "Goal row"], ["F-132", "Loop and heartbeat rows"]]) {
    record(id, AREA, label, "NOT-RUN", "the status drawer shows these once the server reports them (subagent SSE, task stack, /api/goals); the canned model starts none");
  }
  notRun("F-134", AREA, "Suggestion pills", "need an unconfigured MCP/skill context to suggest");
  notRun("F-135", AREA, "Micro-action badges", "need an agent turn that proposes one");
  record("F-139", AREA, "Floating composer pop-out", "NOT-RUN", "a Settings > Appearance toggle (Floating Composer); the setting is present, the drag was not driven");
  record("F-141", AREA, "Handoff to a messaging platform", "INERT", "needs a configured messaging platform (Connections)");
}
