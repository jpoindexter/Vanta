import type http from "node:http";
import { handleCompanyRead } from "./company-read-routes.js";
import type { DesktopState } from "./handler-state.js";

const GET_ROUTES = /^\/api\/(company|tickets|budgets|activity|okrs|work-products|heartbeats)(\/|$)/;

/**
 * Entry point for the company API (DN-18). GET reads the real stores; POST
 * mutates them through the engine. Returns false for paths it does not own, so
 * the existing router continues. The boundary token and the GET/POST-only rule
 * are enforced before this runs (desktopBoundaryDecision).
 */
export async function handleCompanyRoute(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
  const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  if (!GET_ROUTES.test(pathname)) return false;
  if (req.method === "GET") return handleCompanyRead(state, req, res);
  return false;
}
