import type http from "node:http";

export function isLoopbackRequest(req: http.IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address.startsWith("::ffff:127.");
}
