import { join } from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Start a one-shot loopback server, return its base URL plus a promise that
 * resolves with the OAuth ?code (or rejects on ?error). Closes after one hit.
 * Rejects with an actionable message if the sandbox blocks localhost TCP binding.
 */
export function awaitLoopbackCode(): Promise<{
  redirectUri: string;
  code: Promise<string>;
}> {
  return new Promise((resolveServer, rejectServer) => {
    let resolveCode!: (code: string) => void;
    let rejectCode!: (err: Error) => void;
    const code = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const err = url.searchParams.get("error");
      const got = url.searchParams.get("code");
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(
        err || !got
          ? `Authorization failed: ${err ?? "no code"}. You can close this tab.`
          : "Vanta is authorized. You can close this tab.",
      );
      server.close();
      if (err) rejectCode(new Error(`OAuth error: ${err}`));
      else if (got) resolveCode(got);
      else rejectCode(new Error("OAuth redirect missing code"));
    });

    server.once("error", (err) => {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === "EPERM" || nodeErr.code === "EACCES") {
        // Signal to runGoogleAuth to try the kernel-relay fallback.
        const blocked = new Error("loopback-blocked") as NodeJS.ErrnoException;
        blocked.code = "LOOPBACK_BLOCKED";
        rejectServer(blocked);
      } else {
        rejectServer(err);
      }
    });

    server.listen(0, "127.0.0.1", () => {
      server.removeAllListeners("error");
      const port = (server.address() as AddressInfo).port;
      resolveServer({ redirectUri: `http://127.0.0.1:${port}`, code });
    });
  });
}

// ---------------------------------------------------------------------------
// Kernel-relay OAuth fallback: when localhost TCP listen is blocked (sandbox),
// route the callback through the Vanta kernel's HTTP server (already running
// on port 7788 outside the sandbox). The browser redirects to
// http://127.0.0.1:7788/oauth/callback?code=... and the kernel stores the
// code; the agent polls /api/oauth/poll (token-gated) until it arrives.
// ---------------------------------------------------------------------------

export async function readApiToken(env: NodeJS.ProcessEnv): Promise<string | null> {
  // Walk up from VANTA_ROOT/cwd — same logic as kernel/client.ts so we find
  // the per-project token even when cwd is vanta-ts/ and the token is at the repo root.
  const { readFileSync } = await import("node:fs");
  let dir = env.VANTA_ROOT ?? process.cwd();
  for (let i = 0; i < 20; i++) {
    try {
      const t = readFileSync(join(dir, ".vanta", "api-token"), "utf8").trim();
      if (t) return t;
    } catch { /* not here */ }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export async function pollKernelForCode(kernelUrl: string, apiToken: string): Promise<string> {
  for (let i = 0; i < 150; i++) {
    await new Promise<void>((r) => setTimeout(r, 2000));
    const res = await fetch(`${kernelUrl}/api/oauth/poll`, {
      headers: { "X-Vanta-Token": apiToken },
    }).catch(() => null);
    if (!res?.ok) continue;
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data) continue;
    if (typeof data.error === "string") throw new Error(`OAuth error: ${data.error}`);
    if (typeof data.code === "string") return data.code;
  }
  throw new Error("Google OAuth timed out waiting for authorization (5 min limit).");
}

export async function awaitCodeViaKernelRelay(
  env: NodeJS.ProcessEnv,
  notify: (msg: string) => void,
): Promise<{ redirectUri: string; code: Promise<string> }> {
  const kernelUrl = (env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788").replace(/\/$/, "");
  const apiToken = await readApiToken(env);
  if (!apiToken) {
    throw new Error(
      "Loopback server blocked and kernel API token not found — run `vanta doctor`.\n" +
      "Or run `./run.sh auth google` in a regular terminal.",
    );
  }
  const status = await fetch(`${kernelUrl}/api/status`).catch(() => null);
  if (!status?.ok) {
    throw new Error(
      `Loopback server blocked and kernel not reachable at ${kernelUrl}.\n` +
      "Start it with `cargo run -- serve` or `./run.sh`, then retry.",
    );
  }
  notify("\n(Loopback blocked — routing callback through the kernel on port 7788)\n");
  const redirectUri = `${kernelUrl}/oauth/callback`;
  const code = pollKernelForCode(kernelUrl, apiToken);
  return { redirectUri, code };
}
