import { createDesktopServer } from "../desktop/server.js";

export async function servePublicApi(repoRoot: string, port = 7791): Promise<void> {
  const server = createDesktopServer(repoRoot, { publicApi: true, port });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  console.log(`vanta public API v1 — http://127.0.0.1:${port}/api/v1`);
}
