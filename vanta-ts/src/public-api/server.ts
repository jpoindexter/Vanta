import { createDesktopServer } from "../desktop/server.js";
import { parsePublicApiAllowedOrigins } from "./routes.js";

export async function servePublicApi(repoRoot: string, port = 7791): Promise<void> {
  const allowedOrigins = [...parsePublicApiAllowedOrigins(process.env.VANTA_PUBLIC_API_ALLOWED_ORIGINS)];
  const server = createDesktopServer(repoRoot, { publicApi: true, publicApiAllowedOrigins: allowedOrigins, port });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  console.log(`vanta public API v1 — http://127.0.0.1:${port}/api/v1`);
}
