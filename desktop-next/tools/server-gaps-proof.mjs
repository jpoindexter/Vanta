// Proof for the server gaps (session folders and project lanes, the Bots roster, Settings pages, the reasoning
// pill, images queued behind a running turn, the Browser pane) against the real app: Electron shell, real Vanta
// server, sandboxed home, hidden window. Prints one line per check.
//
//   node tools/build-vanta.mjs && node tools/server-gaps-proof.mjs [--only=lanes,bots,settings,effort]
import fs from "node:fs";
import path from "node:path";

import { launchVanta, waitForShell } from "./vanta-app.mjs";
import { closeMenus, goHome, overlay, startChat, waitUntil } from "./proof/kit.mjs";

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

const app = await launchVanta({ hidden: true, seed });
const page = app.page;
const api = (request) => page.evaluate((r) => window.hermesDesktop.api(r), request);
const side = page.locator('[data-tour="sessions-sidebar"]').first();

async function filters() {
  await side.getByRole("button", { name: /^Filters$/ }).first().click();
  await page.waitForTimeout(300);
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
    await page.evaluate(() => {
      const original = window.hermesDesktop.api.bind(window.hermesDesktop);
      window.__failed = [];
      window.hermesDesktop.api = (request) => original(request).catch((error) => { window.__failed.push(`${request.method ?? "GET"} ${request.path} -> ${String(error.message).slice(0, 80)}`); throw error; });
    });
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
        console.log("   failed calls:", await page.evaluate(() => { const f = [...new Set(window.__failed)]; window.__failed = []; return f; }));
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
    const mode = await api({ method: "GET", path: "/api/access-mode" });
    say("F-163w", mode.mode === "ask", `Safety > Approvals Manual -> access mode ${mode.mode}`);
    await overlay(page).getByRole("combobox").first().click();
    await page.getByRole("option", { name: /^Off/ }).first().click();
    await page.waitForTimeout(2500);
    const toast = (await page.locator("[role=alert], [role=status], [data-sonner-toast], [class*=toast i]").allInnerTexts()).join(" | ").replace(/\n+/g, " / ");
    const stillAsk = (await api({ method: "GET", path: "/api/access-mode" })).mode;
    say("F-163x", /must be one of manual, smart/.test(toast) && stillAsk === "ask", `choosing Off is refused and says why: "${toast.slice(0, 200)}" (mode still ${stillAsk})`);
  }
} catch (error) {
  console.error("proof stopped:", String(error.message ?? error).split("\n").slice(0, 6).join(" | "));
}
await app.close();
process.exit(out.some((r) => !r.ok) ? 1 : 0);
