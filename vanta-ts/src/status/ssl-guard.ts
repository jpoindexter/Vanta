// SSL/TLS preflight guard for `vanta doctor`. A common mid-session failure is a
// confusing fetch error caused by a TLS misconfig BEFORE any provider/MCP call:
// a corporate proxy intercepting TLS (self-signed cert in the chain), or a
// `NODE_EXTRA_CA_CERTS` pointing at a bundle that doesn't exist. Both surface as
// opaque "fetch failed" / "self signed certificate in chain" errors deep in a
// turn. This module diagnoses that up front and hands back an ACTIONABLE hint.
//
// Pure + injectable by design: `classifyTlsError`, `sslHint`, and
// `formatSslGuardLine` are pure; `checkSslGuard` takes its two side effects
// (the live TLS probe + the fs existence check) as injected deps so the whole
// thing is unit-testable with no real network or filesystem. It NEVER throws —
// a probe that throws degrades to "unknown-tls", matching gatherStatus's
// best-effort contract.
//
// ADVISORY ONLY: a TLS warning is doctor health, not a security gate. It never
// changes Vanta's security posture and the actual fetch path is unchanged — it
// just tells the operator how to fix a misconfig before they hit it.
//
// Where this slots into the live doctor (NOT wired this round — mirror the
// clarity/config-validate detectors): `status.ts` `gatherStatus` would call
//   const ssl = await checkSslGuard({
//     caCertsPath: env.NODE_EXTRA_CA_CERTS,
//     fileExists: (p) => fs.existsSync(p),                 // the fs boundary
//     probeTls: () => httpsHead("https://www.howsmyssl.com/a/check"), // the live TLS boundary
//   });
// (probeTls = a real HTTPS HEAD to a stable endpoint, resolving
// `{ok:true}` / `{ok:false, code}` from the Node TLS error code) and
// `formatStatus` would push `formatSslGuardLine(ssl)` into the report lines.

/** The kind of TLS misconfig the guard distinguishes, or none. */
export type SslIssue = "missing-ca-file" | "self-signed" | "expired" | "unknown-tls";

/** Result of the preflight: healthy → `{ok:true}`; a misconfig → the issue + a hint. */
export type SslGuardResult =
  | { ok: true }
  | { ok: false; issue: SslIssue; hint: string };

/** The injected probe outcome: success, or a failure carrying the Node TLS error code. */
export type TlsProbeResult = { ok: true } | { ok: false; code: string };

/** Side effects the check needs, injected so the pure logic stays testable. */
export type SslGuardDeps = {
  /** `NODE_EXTRA_CA_CERTS` if the operator set it (an extra CA bundle path). */
  caCertsPath?: string;
  /** Does this path exist on disk? (live: `fs.existsSync`.) */
  fileExists: (path: string) => boolean;
  /** Probe an HTTPS endpoint; resolves the TLS verdict. (live: a real HEAD.) */
  probeTls: () => Promise<TlsProbeResult>;
};

// Node TLS error codes that mean "an untrusted/self-signed cert is in the chain"
// — the corporate-proxy / missing-CA-bundle signature.
const SELF_SIGNED_CODES = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
]);

const EXPIRED_CODES = new Set(["CERT_HAS_EXPIRED"]);

/**
 * Map a Node TLS error code to the issue kind. The self-signed family
 * (SELF_SIGNED_CERT_IN_CHAIN / DEPTH_ZERO_SELF_SIGNED_CERT /
 * UNABLE_TO_GET_ISSUER_CERT_LOCALLY) → `"self-signed"`; CERT_HAS_EXPIRED →
 * `"expired"`; anything else (incl. unknown/empty) → `"unknown-tls"`. Pure.
 */
export function classifyTlsError(code: string): Exclude<SslIssue, "missing-ca-file"> {
  if (SELF_SIGNED_CODES.has(code)) return "self-signed";
  if (EXPIRED_CODES.has(code)) return "expired";
  return "unknown-tls";
}

/**
 * The actionable, operator-facing hint for an issue. Each names the concrete
 * fix; the CA-related ones name `NODE_EXTRA_CA_CERTS` explicitly. `env` lets the
 * missing-CA hint echo the offending path. Pure.
 */
export function sslHint(issue: SslIssue, env: { caCertsPath?: string } = {}): string {
  switch (issue) {
    case "missing-ca-file":
      return `NODE_EXTRA_CA_CERTS=${env.caCertsPath ?? "<path>"} does not exist — point it at an existing CA bundle file, or unset it`;
    case "self-signed":
      return "set NODE_EXTRA_CA_CERTS to your corporate CA bundle, or the proxy is intercepting TLS";
    case "expired":
      return "the server's TLS certificate has expired — check the system clock, or the endpoint's cert needs renewal";
    case "unknown-tls":
      return "TLS handshake failed — check network/proxy settings; set NODE_EXTRA_CA_CERTS if behind a TLS-intercepting proxy";
  }
}

/**
 * Run the preflight. Order:
 *  1. If `caCertsPath` is set but the file is absent → `missing-ca-file` (no
 *     probe — the bundle is broken regardless of the network).
 *  2. Otherwise probe TLS. A cert/TLS error → classify the code + hint. A probe
 *     that throws degrades to `unknown-tls` (never crashes doctor).
 *  3. A clean probe → `{ok:true}` (a healthy TLS setup is silent).
 * Never throws — errors are values.
 */
export async function checkSslGuard(deps: SslGuardDeps): Promise<SslGuardResult> {
  const { caCertsPath, fileExists, probeTls } = deps;

  if (caCertsPath && !fileExists(caCertsPath)) {
    return { ok: false, issue: "missing-ca-file", hint: sslHint("missing-ca-file", { caCertsPath }) };
  }

  let probe: TlsProbeResult;
  try {
    probe = await probeTls();
  } catch {
    // A probe that throws (DNS, abort, unexpected) is a TLS unknown, not a crash.
    return { ok: false, issue: "unknown-tls", hint: sslHint("unknown-tls") };
  }

  if (probe.ok) return { ok: true };

  const issue = classifyTlsError(probe.code);
  return { ok: false, issue, hint: sslHint(issue) };
}

/** Render the guard result as a single doctor line. Pure. */
export function formatSslGuardLine(result: SslGuardResult): string {
  if (result.ok) return "✓ TLS ok";
  return `⚠ TLS: ${result.issue} — ${result.hint}`;
}
