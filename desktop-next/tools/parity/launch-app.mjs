// The app under measurement: the built Vanta desktop (Electron shell + real Vanta server) in a sandbox,
// off-screen. It must be a fixtures build (`npm run parity:build`): the checker drives each wireframe state
// by calling window.__vantaFixture, which only such a build contains.
import fs from "node:fs";
import path from "node:path";
import { desktopRoot, launchVanta, waitForShell } from "../vanta-app.mjs";

const FIXTURE_MARKER = "__vantaFixture";

function assertFixturesBuild(root) {
  const assets = path.join(root, "dist", "assets");
  const hit = fs.existsSync(assets) && fs.readdirSync(assets).some((f) => f.endsWith(".js") && fs.readFileSync(path.join(assets, f), "utf8").includes(FIXTURE_MARKER));
  if (!hit) throw new Error(`${root}/dist is not a fixtures build (no ${FIXTURE_MARKER} in dist/assets). Run: npm run parity:build`);
}

export async function launchMockApp({ desktopRoot: root = desktopRoot, width, height }) {
  assertFixturesBuild(root);
  const app = await launchVanta({ hidden: true, width, height });
  await waitForShell(app.page);
  await app.page.waitForFunction(() => typeof window.__vantaFixture === "function", null, { timeout: 60_000 });
  return { page: app.page, resize: app.resize, close: app.close };
}
