import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { LINKEDIN_REDIRECT_URI } from "./contract.js";

interface CallbackOptions {
  port?: number;
  timeoutMs?: number;
}

export interface LinkedInCallback {
  redirectUri: string;
  code: Promise<string>;
  close: () => Promise<void>;
}

function statesMatch(expected: string, received: string | null): boolean {
  if (!received) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
  });
}

function respond(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    "content-type": "text/plain",
    "cache-control": "no-store",
    connection: "close",
  });
  response.end(message);
}

function handleCallback(input: {
  request: IncomingMessage;
  response: ServerResponse;
  expectedState: string;
  server: Server;
  resolveCode: (code: string) => void;
  rejectCode: (error: Error) => void;
}): void {
  const url = new URL(input.request.url ?? "/", LINKEDIN_REDIRECT_URI);
  if (url.pathname !== "/linkedin/callback") {
    respond(input.response, 404, "Not found.");
    return;
  }
  if (!statesMatch(input.expectedState, url.searchParams.get("state"))) {
    respond(input.response, 400, "Authorization state did not match. Return to Vanta and retry.");
    return;
  }
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  respond(input.response, 200, error || !code
    ? "LinkedIn authorization failed. Return to Vanta for details."
    : "LinkedIn is connected to Vanta. You can close this tab.");
  void closeServer(input.server).then(() => {
    if (error) input.rejectCode(new Error(`LinkedIn authorization was denied: ${error}`));
    else if (code) input.resolveCode(code);
    else input.rejectCode(new Error("LinkedIn redirect did not include an authorization code."));
  });
}

export async function startLinkedInCallback(
  expectedState: string,
  options: CallbackOptions = {},
): Promise<LinkedInCallback> {
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const server = createServer((request, response) => handleCallback({
    request,
    response,
    expectedState,
    server,
    resolveCode,
    rejectCode,
  }));

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 8765, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  }).catch((error: unknown) => {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EADDRINUSE") {
      throw new Error("LinkedIn callback port 8765 is already in use. Stop that process and retry.");
    }
    throw error;
  });

  const timeout = setTimeout(() => {
    void closeServer(server);
    rejectCode(new Error("LinkedIn authorization timed out after 5 minutes."));
  }, options.timeoutMs ?? 300_000);
  code.finally(() => clearTimeout(timeout)).catch(() => {});
  const port = (server.address() as AddressInfo).port;
  return {
    redirectUri: `http://127.0.0.1:${port}/linkedin/callback`,
    code,
    close: () => closeServer(server),
  };
}
