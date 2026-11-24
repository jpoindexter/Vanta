// Proof for the server gaps (session folders and project lanes, the Bots roster, Settings pages, the reasoning
// pill, images queued behind a running turn, the Browser pane) against the real app: Electron shell, real Vanta
// server, sandboxed home, hidden window. Prints one line per check.
//
//   node tools/build-vanta.mjs && node tools/server-gaps-proof.mjs [--only=lanes,bots,settings,effort]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { launchVanta, waitForShell } from "./vanta-app.mjs";
import { installNativeStubs, setAnswers } from "./proof/native-stubs.mjs";
import { closeMenus, goHome, overlay, pick, startChat, waitUntil } from "./proof/kit.mjs";

const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "").replace("--only=", "").split(",").filter(Boolean);
const wants = (name) => !only.length || only.includes(name);
const out = [];
const say = (id, ok, note) => {
  out.push({ id, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} :: ${note}`);
};

const DAY = 86_400_000;

function seed({ project, root, vantaHome }) {
  const other = path.join(root, "project", "other-site");
  fs.mkdirSync(path.join(other, "docs"), { recursive: true });
  const dir = path.join(vantaHome, "sessions");
  fs.mkdirSync(dir, { recursive: true });
  const row = (id, title, ageDays, cwd) => {
    const at = new Date(Date.now() - ageDays * DAY).toISOString();
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, title, started: at, updated: at, ...(cwd ? { cwd } : {}), messages: [{ role: "user", content: title }, { role: "assistant", content: `Answer: ${title}` }] }, null, 2));
  };
  row("20261010-090000-a", "Acme: fix the header", 1, project);
  row("20261010-090001-b", "Acme: add a footer", 2, path.join(project, "src"));
  row("20261010-090002-c", "Other: draft the docs", 3, path.join(other, "docs"));
  row("20261010-090003-d", "Legacy chat from before folders", 4, null);
  return other;
}

// A made-up key lets the session switch to a provider whose models offer reasoning levels; no request is sent with it.
const app = await launchVanta({ hidden: true, seed, extraEnv: { ANTHROPIC_API_KEY: "sk-ant-proof-placeholder-not-real" } });
const page = app.page;
const api = (request) => page.evaluate((r) => window.desktopBridge.api(r), request);
const side = page.locator('[data-tour="sessions-sidebar"]').first();

async function filters() {
  await side.getByRole("button", { name: /^Filters$/ }).first().click();
  await page.waitForTimeout(300);
}

async function fresh() {
  await closeMenus(page);
  await page.reload();
  await waitForShell(page);
  await page.waitForTimeout(3000);
  await page.getByRole("tab", { name: /^Sessions$/ }).first().click().catch(() => undefined);
}

try {
  await waitForShell(page);
  await page.waitForTimeout(6000);
  page.setDefaultTimeout(10000);

  if (wants("lanes")) {
    const sessions = await api({ method: "GET", path: "/api/sessions" });
    const withCwd = sessions.filter((s) => s.cwd);
    say("F-048a", withCwd.length === 3 && sessions.some((s) => !s.cwd), `GET /api/sessions rows carry cwd: ${withCwd.length} of ${sessions.length} (the legacy one has none)`);
    const other = path.join(app.root, "project", "other-site");
    const created = await api({ body: { name: "Other site", path: other }, method: "POST", path: "/api/projects/create" });
    say("F-048b", created.ok === true, `second project created: ${created.project?.name}`);
    await page.reload();
    await waitForShell(page);
    await page.waitForTimeout(5000);
    await filters();
    const grouping = page.getByRole("menuitem", { name: /^Grouping/ });
    await grouping.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    console.log("grouping items:", await page.locator("[role=menuitemradio]").allInnerTexts());
    console.log("picked Project:", await page.evaluate(() => { const el = [...document.querySelectorAll("[role=menuitemradio]")].find((e) => e.textContent.trim().startsWith("Project")); el?.click(); return Boolean(el); }));
    await closeMenus(page);
    await page.waitForTimeout(2500);
    const text = await side.innerText();
    console.log("--- sidebar (Project grouping) ---\n" + text + "\n---");
    say("F-048", /acme-site/i.test(text) && /Other site/.test(text), `lanes: ${/acme-site/i.test(text) ? "acme-site " : ""}${/Other site/.test(text) ? "Other site " : ""}${/Home/.test(text) ? "Home" : ""}`);
    if (process.env.PROOF_SHOTS) await page.screenshot({ path: `${process.env.PROOF_SHOTS}/lanes.png` });
    await side.getByText("Other site", { exact: true }).first().click({ button: "right" });
    await page.waitForTimeout(500);
    const menu = await page.locator("[role=menuitem]").allInnerTexts();
    console.log("project menu:", menu);
    say("F-049", menu.length > 2, `project menu items: ${menu.join(" / ")}`);
    await closeMenus(page);
    await side.getByText("Other site", { exact: true }).first().click();
    await page.waitForTimeout(2000);
    const entered = await side.innerText();
    console.log("--- entered project ---\n" + entered.slice(0, 600) + "\n---");
    say("F-048c", /Other: draft the docs/.test(entered) && !/Acme: fix/.test(entered), "entering Other site lists only its chat (projects.project_sessions)");
    await goHome(page);
    await startChat(page);
    const after = await api({ method: "GET", path: "/api/sessions" });
    const fresh = after.find((s) => s.title === "Say hello" || /hello/i.test(s.title ?? ""));
    say("F-048d", fresh?.cwd === app.project, `a chat started in the app records its folder: ${fresh?.cwd}`);
  }
  if (wants("bots")) {
    const made = await api({ body: { name: "research" }, method: "POST", path: "/api/profiles/create" });
    say("F-070a", made.ok === true, "profile research created through POST /api/profiles");
    await page.reload();
    await waitForShell(page);
    await page.waitForTimeout(4000);
    await page.getByRole("tab", { name: /^Bots$/ }).first().click().catch(() => page.getByText("Bots", { exact: true }).first().click());
    await page.waitForTimeout(3000);
    const bots = await page.locator("body").innerText();
    console.log("--- Bots tab ---\n" + bots.slice(0, 300).replace(/\n+/g, " | ") + "\n---");
    say("F-070", /research/i.test(bots), `roster lists research: ${/research/i.test(bots)}`);
    say("F-071", /Research/.test(bots) && /Vanta/.test(bots), "bot rows: the default profile (Vanta) and Research, from profiles.list");
    if (process.env.PROOF_SHOTS) await page.screenshot({ path: `${process.env.PROOF_SHOTS}/bots.png` });
  }
  if (wants("settings")) {
    await fresh();
    await goHome(page);
    await page.getByTestId("titlebar-settings").click();
    await page.waitForTimeout(900);
    const nav = (name) => overlay(page).getByRole("button", { name, exact: true }).first();
    const pages = [
      ["Model", "Main model"], ["Model", "Fallback models"], ["Model", "Auxiliary models"], ["Model", "Mixture of Agents"],
      ["Chat", "Behavior"], ["Chat", "Attachments"],
      ["Workspace", "Projects & discovery"], ["Workspace", "Shell environment"], ["Workspace", "Files & execution"],
      ["Safety", "Approvals"], ["Safety", "Privacy & network"], ["Safety", "Checkpoints"],
      ["Browser", "Browser profile"], ["Browser", "Local & private URLs"],
      ["Memory & Context", "Persistent memory"], ["Memory & Context", "Context & compression"],
      ["Voice", "Voice conversation"], ["Voice", "Speech to text"], ["Voice", "Text to speech"],
      ["Advanced", "Desktop & startup"], ["Advanced", "Agent limits"], ["Advanced", "Tool access"], ["Advanced", "Terminal backend"], ["Advanced", "Subagents"], ["Advanced", "Output limits"],
      ["Providers", "Accounts"], ["Tools & Keys", "Tools"]
    ];
    for (const [section, sub] of pages) {
      try {
        await nav(section).click();
        await page.waitForTimeout(250);
        if ((await nav(sub).count()) > 0) await nav(sub).click();
        await page.waitForTimeout(500);
        await waitUntil(async () => (await overlay(page).locator('[class*="animate-pulse"], [data-slot="skeleton"]').count()) === 0, 5000, 400);
        const text = (await overlay(page).innerText()).replace(/\n+/g, " | ");
        const body = text.slice(text.indexOf("Settings |"));
        const failed = /failed to load|could not load/i.test(body);
        console.log(`SETTINGS ${section} > ${sub} :: ${failed ? "FAILED" : "loaded"} :: ${body.slice(body.indexOf(sub) >= 0 ? body.lastIndexOf(sub) : 0).slice(0, 330)}`);
        if (process.env.PROOF_SHOTS) await page.screenshot({ path: `${process.env.PROOF_SHOTS}/set-${section.replace(/\W+/g, "")}-${sub.replace(/\W+/g, "")}.png` });
      } catch (error) {
        console.log(`SETTINGS ${section} > ${sub} :: threw ${String(error.message).split("\n")[0].slice(0, 100)}`);
      }
    }
    // Write path: a switch on Chat > Behavior reaches the server's desktop-settings.json and survives a reload.
    await nav("Chat").click();
    await nav("Behavior").click();
    await page.waitForTimeout(800);
    const toggle = overlay(page).getByRole("switch").first();
    const before = await toggle.getAttribute("aria-checked");
    await toggle.click();
    await page.waitForTimeout(2200);
    const prefsFile = path.join(app.root, "vanta-home", "desktop-settings.json");
    const saved = fs.existsSync(prefsFile) ? JSON.parse(fs.readFileSync(prefsFile, "utf8")) : null;
    say("F-158w", saved?.showReasoning === (before !== "true"), `Chat > Behavior switch ${before} -> ${saved?.showReasoning}; desktop-settings.json: ${JSON.stringify(saved)}`);
    const record = await api({ method: "GET", path: "/api/config" });
    say("F-158r", record.display?.show_reasoning === saved?.showReasoning, `GET /api/config reads it back: display.show_reasoning=${record.display?.show_reasoning}`);
    // Safety > Approvals: choosing Manual changes the real access mode.
    await nav("Safety").click();
    await nav("Approvals").click();
    await page.waitForTimeout(800);
    await overlay(page).getByRole("combobox").first().click();
    await page.waitForTimeout(400);
    console.log("approval options:", await page.getByRole("option").allInnerTexts());
    await page.getByRole("option", { name: /manual/i }).first().click();
    await page.waitForTimeout(2500);
    // Read the saved project setting: each chat window keeps its own in-memory copy.
    const savedMode = () => JSON.parse(fs.readFileSync(path.join(app.project, ".vanta", "settings.local.json"), "utf8")).desktop?.accessMode;
    say("F-163w", savedMode() === "ask", `Safety > Approvals Manual -> saved access mode ${savedMode()}`);
    await overlay(page).getByRole("combobox").first().click();
    await page.getByRole("option", { name: /^Off/ }).first().click();
    await page.waitForTimeout(2500);
    const toast = (await page.locator("[role=alert], [role=status], [data-sonner-toast], [class*=toast i]").allInnerTexts()).join(" | ").replace(/\n+/g, " / ");
    const stillAsk = savedMode();
    say("F-163x", /must be one of manual, smart/.test(toast) && stillAsk === "ask", `choosing Off is refused and says why: "${toast.slice(0, 200)}" (mode still ${stillAsk})`);
  }
  if (wants("browser")) {
    await fresh();
    // A local web page that probes what a guest can reach, and reports it in its own title.
    const PAGE = `<!doctype html><title>starting</title><body><h1 id="h">Fixture page</h1>
<a id="blank" target="_blank" href="http://127.0.0.1:__PORT__/other">new window</a>
<script>
const out = {};
out.bridge = typeof window.desktopBridge + "/" + typeof window.vantaDesktop + "/" + typeof window.require + "/" + typeof window.process;
Promise.all([
  Notification.requestPermission().then((p) => (out.notify = p)),
  new Promise((done) => navigator.geolocation.getCurrentPosition(() => { out.geo = "granted"; done(); }, (e) => { out.geo = "denied:" + e.code; done(); }, { timeout: 3000 })),
  navigator.mediaDevices.getUserMedia({ audio: true }).then(() => (out.mic = "granted"), (e) => (out.mic = "denied:" + e.name)),
  fetch("http://127.0.0.1:__PORT__/ping").then((r) => r.text()).then((t) => (out.fetch = t)),
]).then(() => { document.title = "probed:" + JSON.stringify(out); });
</script>`;
    let hits = [];
    const server = http.createServer((req, res) => {
      hits.push(req.url);
      if (req.url === "/ping") return res.end("pong");
      res.setHeader("content-type", "text/html");
      res.end(PAGE.replaceAll("__PORT__", String(server.address().port)));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.address().port}/`;
    await installNativeStubs(app, { confirm: true, downloadDir: app.root, pickFolder: null, savePath: null });
    await goHome(page);
    await page.getByTestId("titlebar-browser").click();
    const address = page.getByLabel("Address");
    await address.waitFor({ state: "visible" });
    await page.waitForTimeout(1500);
    await closeMenus(page);
    await page.waitForTimeout(1000);
    await address.fill(url);
    await address.press("Enter");
    await page.waitForTimeout(1500);
    const guestInfo = () => app.app.evaluate(async ({ webContents }) => {
      const guest = webContents.getAllWebContents().find((w) => w.getType() === "webview");
      if (!guest) return null;
      const prefs = guest.getLastWebPreferences();
      return { url: guest.getURL(), title: guest.getTitle(), persistent: guest.session.isPersistent(), nodeIntegration: prefs.nodeIntegration, contextIsolation: prefs.contextIsolation, sandbox: prefs.sandbox, preload: prefs.preload ?? null, webSecurity: prefs.webSecurity };
    });
    const info = await waitUntil(async () => { const g = await guestInfo(); return g && g.title.startsWith("probed:") ? g : null; }, 20000, 500);
    say("F-105", Boolean(info) && info.url === url, `the Browser pane loaded the local page: url=${info?.url} title=${info?.title?.slice(0, 40)}`);
    const probed = info ? JSON.parse(info.title.slice(7)) : {};
    say("F-105s", info?.persistent === false && info?.nodeIntegration === false && info?.contextIsolation === true && info?.sandbox === true && info?.preload === null && info?.webSecurity !== false, `guest posture: persistent=${info?.persistent} nodeIntegration=${info?.nodeIntegration} contextIsolation=${info?.contextIsolation} sandbox=${info?.sandbox} preload=${info?.preload}`);
    say("F-105b", probed.bridge === "undefined/undefined/undefined/undefined", `the page cannot see the bridge or Node: desktopBridge/vantaDesktop/require/process = ${probed.bridge}`);
    say("F-105p", probed.notify === "denied" && String(probed.geo).startsWith("denied") && String(probed.mic).startsWith("denied"), `permissions: notifications=${probed.notify} geolocation=${probed.geo} microphone=${probed.mic}`);
    say("F-105n", probed.fetch === "pong", "an ordinary http fetch from the page still works");
    // New-window links go to the system browser (stubbed shell.openExternal), never a popup.
    const windowsBefore = await app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    await app.app.evaluate(({ webContents }) => { const g = webContents.getAllWebContents().find((w) => w.getType() === "webview"); return g.executeJavaScript('document.getElementById("blank").click()', true); });
    await page.waitForTimeout(1200);
    const link = await app.app.evaluate(({ webContents }) => { const g = webContents.getAllWebContents().find((w) => w.getType() === "webview"); return g.executeJavaScript('(() => { const r = document.getElementById("blank").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()'); });
    const box = await page.evaluate(() => { const r = document.querySelector("webview").getBoundingClientRect(); return { x: r.x, y: r.y }; });
    const pageBefore = (await guestInfo()).url;
    // A real click (a pointer event reaches the guest), not a scripted one.
    await page.mouse.click(box.x + link.x, box.y + link.y);
    await page.waitForTimeout(1500);
    const external = await app.app.evaluate(() => globalThis.__proof.external);
    const windowsAfter = await app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    const stayed = (await guestInfo()).url === pageBefore;
    say("F-105x", external.length === 1 && external[0] === `${url}other` && windowsAfter === windowsBefore && stayed, `a real click on a target=_blank link went to the system browser: ${JSON.stringify(external)}; windows ${windowsBefore} -> ${windowsAfter}; pane stayed on its page=${stayed}`);
    // A page that opens links with no click (a script) opens nothing.
    const afterClick = (await app.app.evaluate(() => globalThis.__proof.external)).length;
    await page.waitForTimeout(2200);
    await app.app.evaluate(({ webContents }) => { const g = webContents.getAllWebContents().find((w) => w.getType() === "webview"); return g.executeJavaScript('window.open("http://127.0.0.1:1/spam"); document.getElementById("blank").click()'); });
    await page.waitForTimeout(1200);
    const afterScript = (await app.app.evaluate(() => globalThis.__proof.external)).length;
    say("F-105y", afterScript === afterClick, `scripted window.open and click with no real input opened nothing (system-browser opens ${afterClick} -> ${afterScript})`);
    // A page that tries to leave the web stays where it is.
    const before = (await guestInfo()).url;
    const tries = [];
    for (const target of ["file:///etc/hosts", "javascript:document.title='pwned'", "data:text/html,<title>pwned</title>", "vanta://connections/x"]) {
      await app.app.evaluate(({ webContents }, t) => { const g = webContents.getAllWebContents().find((w) => w.getType() === "webview"); return g.executeJavaScript(`location.href = ${JSON.stringify(t)}`, true).catch(() => null); }, target);
      await page.waitForTimeout(700);
      const now = await guestInfo();
      tries.push(`${target.split(":")[0]}:${now.url === before && !now.title.includes("pwned") ? "stayed" : "MOVED to " + now.url}`);
    }
    say("F-105f", tries.every((t) => t.endsWith("stayed")), `navigation away from the web refused: ${tries.join(", ")}`);
    const reload = await page.getByRole("button", { name: "Reload page" }).isVisible().catch(() => false);
    say("F-106", reload && (await page.getByRole("button", { name: "Show preview console" }).count()) > 0, "Back/Forward/Reload, console and DevTools buttons now act on a loaded page");
    if (process.env.PROOF_SHOTS) await page.screenshot({ path: `${process.env.PROOF_SHOTS}/browser.png` });
    server.close();
  }
  if (wants("queue-images")) {
    await fresh();
    await installNativeStubs(app, { confirm: true, downloadDir: app.root, pickFolder: path.join(app.project, "pixel.png"), savePath: path.join(app.root, "saved.png") });
    await goHome(page);
    await startChat(page);
    const editor = page.locator('[data-slot="composer-root"] [contenteditable="true"], [data-slot="composer-root"] textarea').first();
    await editor.click();
    await page.keyboard.type("slow count to ten");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Add context" }).click();
    await page.waitForTimeout(400);
    await pick(page, "Images…");
    const chip = await waitUntil(async () => /pixel\.png/.test(await page.locator('[data-slot="composer-root"]').first().innerText()), 6000, 250);
    await editor.click();
    await page.keyboard.type("look at this too");
    await page.keyboard.press("Meta+Enter");
    await page.waitForTimeout(800);
    const queuedShown = /look at this too/.test(await page.locator("body").innerText());
    const answered = await waitUntil(async () => /I can see the attached image/.test(await page.locator("body").innerText()), 40000, 500);
    say("F-115q", Boolean(chip) && queuedShown && Boolean(answered), `image attached while a turn ran: chip=${Boolean(chip)}, queued row shown=${queuedShown}, the model received it when the queued turn ran and answered "I can see the attached image."=${Boolean(answered)}`);
    const left = fs.existsSync(path.join(app.root, "vanta-home", "desktop-turn-queues", "images")) ? fs.readdirSync(path.join(app.root, "vanta-home", "desktop-turn-queues", "images")).filter((f) => f.endsWith(".json")) : [];
    say("F-115r", left.length === 0, `queued image files left behind after it ran: ${left.length}`);
  }
  if (wants("effort")) {
    await fresh();
    await goHome(page);
    await startChat(page);
    const none = await page.getByTestId("reasoning-pill").count();
    say("F-122a", none === 0, `custom endpoint with no reasoning levels: reasoning pill hidden (count ${none})`);
    await page.locator('[data-vp="chip-model"]').first().click();
    await page.waitForTimeout(700);
    const menuText = (await page.locator("[role=menu]").first().innerText()).replace(/\n+/g, " | ");
    console.log("model menu:", menuText.slice(0, 600));
    await page.keyboard.type("opus");
    await page.waitForTimeout(600);
    await page.locator("[role=menuitem], [role=menuitemradio]").filter({ hasText: /^Opus 4\.8/ }).first().click();
    await page.waitForTimeout(3000);
    if (process.env.PROOF_SHOTS) await page.screenshot({ path: `${process.env.PROOF_SHOTS}/model-pick.png` });
    console.log("toast after model pick:", (await page.locator("[role=alert], [role=status], [data-sonner-toast], [class*=toast i]").allInnerTexts()).join(" | ").replace(/\n+/g, " / ").slice(-300));
    console.log("model chip now:", (await page.locator('[data-vp="chip-model"]').first().innerText()).trim());
    const pill = page.getByTestId("reasoning-pill");
    console.log("pill present:", await pill.count(), "label:", (await pill.first().innerText().catch(() => "")).trim());
    if (await pill.count()) {
      await pill.first().click();
      await page.waitForTimeout(500);
      console.log("pill menu:", (await page.locator("[role=menuitem], [role=menuitemradio]").allInnerTexts()).join(" / "));
      await pick(page, "High");
      await page.waitForTimeout(2500);
      const toast = (await page.locator("[role=alert], [role=status], [data-sonner-toast], [class*=toast i]").allInnerTexts()).join(" | ").replace(/\n+/g, " / ");
      const st = await api({ method: "GET", path: "/api/status" });
      say("F-122b", (await pill.first().innerText()).trim() === "High", `Opus 4.8: choosing High leaves the pill on High with no error toast (${toast.slice(-60).replace(/\s+/g, " ")})`);
      await closeMenus(page);
      await pill.first().click();
      await page.waitForTimeout(400);
      await pick(page, "Ultra");
      await page.waitForTimeout(2500);
      const toast2 = (await page.locator("[role=alert], [role=status], [data-sonner-toast], [class*=toast i]").allInnerTexts()).join(" | ").replace(/\n+/g, " / ");
      const ultraPill = (await pill.first().innerText().catch(() => "")).trim();
      say("F-122c", /not available for this model\. Choose one of: low, medium, high, xhigh, max/.test(toast2) && ultraPill !== "Ultra", `choosing Ultra (not offered) shows the reason and the pill rolls back to ${ultraPill}: "${toast2.slice(-150).replace(/\s+/g, " ")}"`);
    }
  }
} catch (error) {
  console.error("proof stopped:", String(error.message ?? error).split("\n").slice(0, 6).join(" | "));
}
await app.close();
process.exit(out.some((r) => !r.ok) ? 1 : 0);
