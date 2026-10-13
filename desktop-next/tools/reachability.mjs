// Reachability proof for the whole inventory (F-001..F-245): is each control on screen, and does it do
// its job in the running app? Seeds a sandbox, drives the real UI, and writes
// docs/proofs/reachability-full-<date>.md.
//
//   node tools/reachability.mjs [--only=chrome,right,...] [--print]   (run `node tools/build-vanta.mjs` first)
//
// PASS    present, visible and enabled; its action was driven where it is safe to do so.
// INERT   present, but the native or backend call behind it is not wired in this shell (expected).
// FAIL    missing or not working.
// DROPPED removed on purpose (owner decision); the check is that it is gone.
// NOT-RUN needs state or a platform the sandbox cannot give; the note says what.
import path from "node:path";

import { launchVanta, waitForShell } from "./vanta-app.mjs";
import { results, section, writeReport } from "./proof/kit.mjs";
import { GROUPS } from "./proof/groups.mjs";
import { installNativeStubs, makeSecondProject } from "./proof/native-stubs.mjs";
import { seedSessions } from "./proof/seed.mjs";

const OUT_DIR = path.resolve(import.meta.dirname, "..", "docs", "proofs");
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) ?? "").replace("--only=", "").split(",").filter(Boolean);
const printOnly = args.includes("--print");

const app = await launchVanta({ hidden: true, seed: seedSessions });
let failure = null;
try {
  await waitForShell(app.page);
  await app.page.waitForTimeout(8000);
  app.page.setDefaultTimeout(8000);
  const second = makeSecondProject(app.root);
  await installNativeStubs(app, { confirm: true, downloadDir: app.root, pickFolder: second, savePath: path.join(app.root, "saved-image.png") });
  const ctx = { app, page: app.page, project: app.project, second, root: app.root };
  for (const group of GROUPS) {
    if (only.length && !only.includes(group.name)) continue;
    await section(group.name, group.ids ?? [], () => group.run(ctx), app.page);
  }
} catch (error) {
  failure = error;
  console.error("reachability run stopped early:", error.message);
}
if (printOnly || only.length) {
  for (const row of [...results.values()].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))) {
    console.log(`${row.id.padEnd(9)} ${row.result.padEnd(8)} ${row.label} :: ${row.note}`);
  }
}
const date = new Date().toISOString().slice(0, 10);
const counts = only.length
  ? { ran: only.join(",") }
  : writeReport(path.join(OUT_DIR, `reachability-full-${date}.md`), {
      errors: app.errors,
      intro: [
        "Run: `node tools/reachability.mjs` against the built app (Electron shell, real Vanta server and kernel, sandboxed home, hidden window, 1440x900).",
        "State is seeded first: older, pinned, archived and bulk chats; then the run starts chats that run, wait for approval, fail and finish unread.",
        "Native dialogs, Finder, the Trash and the default browser are stubbed in the main process (see tools/proof/native-stubs.mjs); everything else is the real handler.",
        "",
        "PASS = present and its action was driven. INERT = present, but its backend or native call is not wired (expected). FAIL = missing or not working. DROPPED = removed on purpose. NOT-RUN = needs state or a platform the sandbox cannot give."
      ],
      title: `Reachability proof, ${date} (full inventory)`
    });
console.log(counts);
await app.close();
process.exit(failure ? 1 : 0);
