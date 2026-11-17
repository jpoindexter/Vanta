import type { handleCompanionRoute } from "../companion/routes.js";
import type { handlePublicApiProbeRoute, handlePublicApiRoute } from "../public-api/routes.js";

/**
 * The listener must open before the agent, tool and provider modules load.
 * Route handlers are therefore imported on first use, and preloaded in the
 * background once the port is bound (see serveDesktop).
 */
let routes: Promise<typeof import("./server-routes.js")> | undefined;
export function loadDesktopRoutes(): Promise<typeof import("./server-routes.js")> {
  routes ??= import("./server-routes.js");
  return routes;
}

const PUBLIC_API_PREFIX = "/api/v1/";
const COMPANION_PREFIX = "/api/companion/";

// Each real handler starts with the same prefix test, so skipping the import
// for other paths cannot change which requests it handles.
export const handlePublicApiProbeRouteLazy: typeof handlePublicApiProbeRoute = async (args) =>
  args.pathname.startsWith(PUBLIC_API_PREFIX) ? (await import("../public-api/routes.js")).handlePublicApiProbeRoute(args) : false;

export const handlePublicApiRouteLazy: typeof handlePublicApiRoute = async (args) =>
  args.pathname.startsWith(PUBLIC_API_PREFIX) ? (await import("../public-api/routes.js")).handlePublicApiRoute(args) : false;

export const handleCompanionRouteLazy: typeof handleCompanionRoute = async (args) =>
  args.pathname.startsWith(COMPANION_PREFIX) ? (await import("../companion/routes.js")).handleCompanionRoute(args) : false;
