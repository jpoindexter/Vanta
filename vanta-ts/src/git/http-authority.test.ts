import { createServer } from "node:https";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { expect, it } from "vitest";
import { hostileGitFixture } from "./hostile-fixture.js";
import { gitExecFile } from "./process.js";

it("explicit scoped HTTP authentication works on a real TLS Git fixture without repository credential helpers", async () => {
  const f = await hostileGitFixture();
  const key = join(f.root, "tls-key");
  const cert = join(f.root, "tls-cert");
  const secret = "Bearer fixture-authority-only";
  const sha = "a".repeat(40);
  let authorized = 0;
  const run = promisify(execFile);
  await run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key,
    "-out", cert, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { timeout: 10_000 });
  const server = createServer({ key: await readFile(key), cert: await readFile(cert) }, (req, res) => {
    if (req.headers.authorization !== secret) { res.writeHead(401, { "WWW-Authenticate": 'Basic realm="fixture"' }); res.end(); return; }
    authorized++;
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(req.url?.includes("info/refs") ? `${sha}\trefs/heads/main\n` : "ref: refs/heads/main\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing fixture listener");
    const origin = `https://localhost:${address.port}`;
    await f.git(["config", "http.sslCAInfo", cert]);
    await f.git(["config", `http.${origin}/.extraHeader`, "Authorization: Bearer stale-repository-token"]);
    await expect(gitExecFile("git", ["ls-remote", `${origin}/repo.git`], { cwd: f.repo })).rejects.toThrow();
    expect(authorized).toBe(0);
    const result = await gitExecFile("git", ["ls-remote", `${origin}/repo.git`], {
      cwd: f.repo, httpAuthorization: { origin, header: `Authorization: ${secret}` },
    });
    expect(result.stdout).toContain(`${sha}\trefs/heads/main`);
    expect(authorized).toBeGreaterThan(0);
    await expect(readFile(f.marker)).rejects.toThrow();
    expect(result.stdout + result.stderr).not.toContain(secret);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await f.cleanup();
  }
});
