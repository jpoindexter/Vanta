// The app under measurement: the built Vanta desktop (Electron shell + real Vanta server) in a sandbox,
// off-screen. The old Hermes mock launcher cannot start this shell, so the parity run uses tools/vanta-app.mjs.
import { launchVanta, waitForShell } from "../vanta-app.mjs";

export async function launchMockApp({ width, height }) {
  const app = await launchVanta({ hidden: true, width, height });
  await waitForShell(app.page);
  await app.page.waitForTimeout(5000);
  // The app opens on Home; chat states start from an empty chat.
  await app.page.getByTestId("titlebar-new-chat").click();
  await app.page.waitForTimeout(1500);
  return { page: app.page, resize: app.resize, close: app.close };
}
