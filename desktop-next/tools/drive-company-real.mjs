// Drives the Company screens in the real app against the real Vanta server (sandboxed VANTA_HOME,
// canned local model): opens Company, hires a native worker through the approval card, creates a
// ticket, assigns it, and watches the run finish. Off-screen, nothing under ~/.vanta is touched.
//   node tools/drive-company-real.mjs [outDir]       (default docs/proofs/company)
import path from "node:path";

import { launchVanta, waitForShell } from "./vanta-app.mjs";

const out = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", "docs", "proofs", "company"));
const app = await launchVanta({ hidden: true });
const { page } = app;
const log = [];
const note = (message) => { log.push(message); console.log(message); };
const shot = (name) => page.screenshot({ path: path.join(out, `real-${name}.png`) });
const settle = (ms = 600) => page.waitForTimeout(ms);

try {
  await waitForShell(page);
  await settle(1500);
  await page.getByRole("button", { name: "Company" }).first().click();
  await page.getByRole("region", { name: "Company" }).waitFor({ timeout: 15000 });
  await settle(800);
  await shot("01-workers-empty");
  note(`workers empty state: ${await page.getByText(/No workers yet/).count()}`);

  await page.getByTestId("hire-open").click();
  const dialog = page.getByRole("dialog", { name: "Hire worker" });
  await dialog.waitFor();
  await settle(800);
  const providers = await dialog.getByLabel("Provider").locator("option").allTextContents().catch(() => []);
  note(`providers offered: ${JSON.stringify(providers)}`);
  const runtimes = await dialog.getByRole("radio").evaluateAll((nodes) => nodes.map((n) => `${n.id}:${n.disabled ? "disabled" : "enabled"}`));
  note(`runtimes offered: ${JSON.stringify(runtimes)}`);
  await shot("02-hire-dialog");
  await dialog.getByLabel("Role").fill("Engineer");
  await dialog.getByLabel("Budget (US dollars)").fill("2");
  await dialog.getByRole("button", { name: "Hire and ask me to approve" }).click();
  await page.locator("[data-vp='approval-card']").waitFor({ timeout: 15000 });
  await settle(400);
  await shot("03-hire-approval");
  note(`approval says: ${(await page.locator("[data-vp='approval-card']").innerText()).split("\n")[0]}`);
  await page.getByRole("button", { name: "Allow once" }).click();
  await page.getByText("Hired Engineer.").waitFor({ timeout: 15000 });
  await settle(800);
  await shot("04-worker-hired");

  await page.getByRole("tab", { name: "Tickets" }).click();
  await page.getByTestId("ticket-create-open").click();
  const create = page.getByRole("dialog", { name: "New ticket" });
  await create.getByLabel("Title").fill("Write a one line summary of this project");
  await create.getByLabel("Expected output (optional)").fill("report");
  await create.getByLabel("Assign to (optional)").selectOption({ label: "Engineer" });
  await shot("05-create-ticket");
  await create.getByRole("button", { name: "Create ticket" }).click();
  await page.getByText(/Created T-1 and assigned it/).waitFor({ timeout: 20000 }).catch(() => note("assign notice not seen"));
  await settle(3000);
  await shot("06-ticket-list-after-run");
  await page.getByRole("button", { name: /^Open T-1/ }).click();
  await settle(1200);
  await shot("07-ticket-detail");
  note(`ticket detail text: ${(await page.getByRole("region", { name: "Ticket T-1" }).innerText()).replace(/\s+/g, " ").slice(0, 700)}`);

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByText("Approved.").waitFor({ timeout: 15000 });
  await settle(1500);
  await shot("08-approved-and-closed");
  note(`after approve: ${(await page.getByRole("region", { name: "Ticket T-1" }).innerText()).replace(/\s+/g, " ").slice(0, 260)}`);

  await page.getByRole("tab", { name: "Activity" }).click();
  await settle(1000);
  await shot("09-activity");
  await page.getByRole("tab", { name: "Budgets" }).click();
  await settle(1000);
  await shot("10-budgets");
  note(`console errors: ${JSON.stringify(app.errors.slice(0, 5))}`);
} catch (error) {
  note(`FAILED: ${error.message.split("\n")[0]}`);
  await shot("failure").catch(() => undefined);
  process.exitCode = 1;
} finally {
  await app.close();
}
