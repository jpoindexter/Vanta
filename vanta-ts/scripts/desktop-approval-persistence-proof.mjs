// Real-path proof for remembered approvals: Always allow in project A must survive an app
// restart and apply to a NEW chat in A, but must not apply in project B. Disposable state only.
// Run from vanta-ts/ after `npm run desktop:build` (source Electron) or set VANTA_DESKTOP_APP
// to a packaged executable.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";
import { chatFirstProviderFixture } from "./lib/chat-first-provider-fixture.mjs";

const ORIGINAL = "# Local desktop proof\nNo operator data.\n";
const EDITED = "# Approved local edit";
const packaged = process.env.VANTA_DESKTOP_APP;
const root = await mkdtemp(join(tmpdir(), "vanta-approval-persistence-"));
const home = join(root, "state");
const userData = join(root, "profile");
const projectA = join(root, "A");
const projectB = join(root, "B");
await Promise.all([home, userData, projectA, projectB].map((path) => mkdir(path, { recursive: true })));
const reset = (dir) => writeFile(join(dir, "brief.md"), ORIGINAL);
await Promise.all([reset(projectA), reset(projectB)]);
const fixture = await chatFirstProviderFixture();
const results = [];

async function session({ project, port, label, answer }) {
  const target = packaged ? { executablePath: resolve(packaged), args: ["--project", project, "--no-companion"] }
    : { args: [resolve("desktop-app/electron/main.mjs"), "--project", project, "--no-companion"], cwd: process.cwd() };
  const app = await electron.launch({
    ...target,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin", TMPDIR: tmpdir(), LANG: "en_US.UTF-8",
      VANTA_HOME: home, VANTA_DESKTOP_USER_DATA: userData, VANTA_DESKTOP_AUTOMATION: "1", VANTA_DESKTOP_PORT: String(port),
      VANTA_PROVIDER: "custom", VANTA_MODEL: "desktop-proof", VANTA_OPENAI_BASE_URL: fixture.url,
      VANTA_MCP_AUTO_MOUNT: "0", VANTA_PROMPT_SUGGESTIONS: "0", VANTA_OPERATING_MODE: "default", VANTA_PERMISSION_MODE: "default",
    },
  });
  try {
    const page = await app.firstWindow();
    await page.locator(".chat-first-shell").waitFor({ timeout: 45_000 });
    await page.waitForFunction(() => !document.querySelector("#vanta-composer")?.disabled);
    await page.locator("#vanta-composer").fill("Approval proof: update brief.md");
    await page.keyboard.press("Enter");
    const card = page.locator(".inline-approval");
    const shown = await card.waitFor({ timeout: 12_000 }).then(() => true, () => false);
    if (shown && answer) await card.getByRole("button", { name: answer, exact: true }).click();
    await page.waitForTimeout(shown ? 4_000 : 6_000);
    const brief = (await readFile(join(project, "brief.md"), "utf8")).split("\n")[0];
    results.push({ label, approvalShown: shown, answer: shown ? answer : null, brief });
  } finally { await app.close(); }
}

try {
  await session({ project: projectA, port: 18801, label: "A: save Always allow", answer: "Always allow this tool" });
  await reset(projectA);
  await session({ project: projectA, port: 18802, label: "A: restarted app, new chat" });
  await session({ project: projectB, port: 18803, label: "B: other project", answer: "Reject" });
  const [save, restarted, other] = results;
  assert.equal(save.approvalShown, true, "first request must ask");
  assert.equal(save.brief, EDITED, "Always allow must apply the edit");
  assert.equal(restarted.approvalShown, false, "saved rule must apply after restart in a new chat");
  assert.equal(restarted.brief, EDITED, "edit must apply without a prompt after restart");
  assert.equal(other.approvalShown, true, "a rule saved for A must not leak to project B");
  assert.equal(other.brief, "# Local desktop proof", "rejected edit must leave project B unchanged");
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally { await fixture.close?.(); }
