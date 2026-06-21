import { describe, it, expect } from "vitest";
import {
  classifyTlsError,
  sslHint,
  checkSslGuard,
  formatSslGuardLine,
  type SslGuardDeps,
  type TlsProbeResult,
} from "./ssl-guard.js";

// Deps builder: a healthy setup by default (no CA path, an ok probe, all files
// present). Each test overrides only the seam it exercises — no real net/fs.
function deps(over: Partial<SslGuardDeps> = {}): SslGuardDeps {
  return {
    caCertsPath: undefined,
    fileExists: () => true,
    probeTls: async (): Promise<TlsProbeResult> => ({ ok: true }),
    ...over,
  };
}

describe("classifyTlsError", () => {
  it("maps SELF_SIGNED_CERT_IN_CHAIN to self-signed", () => {
    expect(classifyTlsError("SELF_SIGNED_CERT_IN_CHAIN")).toBe("self-signed");
  });

  it("maps DEPTH_ZERO_SELF_SIGNED_CERT to self-signed", () => {
    expect(classifyTlsError("DEPTH_ZERO_SELF_SIGNED_CERT")).toBe("self-signed");
  });

  it("maps UNABLE_TO_GET_ISSUER_CERT_LOCALLY to self-signed", () => {
    expect(classifyTlsError("UNABLE_TO_GET_ISSUER_CERT_LOCALLY")).toBe("self-signed");
  });

  it("maps CERT_HAS_EXPIRED to expired", () => {
    expect(classifyTlsError("CERT_HAS_EXPIRED")).toBe("expired");
  });

  it("maps an unrecognized code to unknown-tls", () => {
    expect(classifyTlsError("ECONNRESET")).toBe("unknown-tls");
  });

  it("maps an empty code to unknown-tls", () => {
    expect(classifyTlsError("")).toBe("unknown-tls");
  });
});

describe("sslHint", () => {
  it("self-signed hint is actionable and mentions NODE_EXTRA_CA_CERTS", () => {
    const hint = sslHint("self-signed");
    expect(hint).toContain("NODE_EXTRA_CA_CERTS");
    expect(hint.toLowerCase()).toContain("proxy");
  });

  it("missing-ca-file hint echoes the offending path and says it does not exist", () => {
    const hint = sslHint("missing-ca-file", { caCertsPath: "/etc/ca/corp.pem" });
    expect(hint).toContain("NODE_EXTRA_CA_CERTS=/etc/ca/corp.pem");
    expect(hint).toContain("does not exist");
  });

  it("missing-ca-file hint falls back to a placeholder when no path given", () => {
    expect(sslHint("missing-ca-file")).toContain("NODE_EXTRA_CA_CERTS=<path>");
  });

  it("expired hint names the expiry cause", () => {
    expect(sslHint("expired").toLowerCase()).toContain("expired");
  });

  it("unknown-tls hint is actionable and still points at NODE_EXTRA_CA_CERTS", () => {
    const hint = sslHint("unknown-tls");
    expect(hint).toContain("NODE_EXTRA_CA_CERTS");
    expect(hint.length).toBeGreaterThan(0);
  });
});

describe("checkSslGuard", () => {
  it("flags missing-ca-file (no probe) when NODE_EXTRA_CA_CERTS is set but absent", async () => {
    let probed = false;
    const res = await checkSslGuard(
      deps({
        caCertsPath: "/no/such/ca.pem",
        fileExists: () => false,
        probeTls: async () => {
          probed = true;
          return { ok: true };
        },
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issue).toBe("missing-ca-file");
      expect(res.hint).toContain("/no/such/ca.pem");
    }
    expect(probed).toBe(false); // a broken bundle short-circuits before probing
  });

  it("does NOT flag missing-ca-file when the CA path exists (falls through to probe)", async () => {
    const res = await checkSslGuard(
      deps({ caCertsPath: "/etc/ca/corp.pem", fileExists: () => true }),
    );
    expect(res.ok).toBe(true);
  });

  it("classifies a self-signed probe error and attaches the hint", async () => {
    const res = await checkSslGuard(
      deps({ probeTls: async () => ({ ok: false, code: "SELF_SIGNED_CERT_IN_CHAIN" }) }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issue).toBe("self-signed");
      expect(res.hint).toContain("NODE_EXTRA_CA_CERTS");
    }
  });

  it("classifies an expired probe error", async () => {
    const res = await checkSslGuard(
      deps({ probeTls: async () => ({ ok: false, code: "CERT_HAS_EXPIRED" }) }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issue).toBe("expired");
  });

  it("returns ok for a clean probe (healthy TLS is silent)", async () => {
    const res = await checkSslGuard(deps());
    expect(res).toEqual({ ok: true });
  });

  it("degrades a probe that throws to unknown-tls instead of crashing", async () => {
    const res = await checkSslGuard(
      deps({
        probeTls: async () => {
          throw new Error("boom");
        },
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issue).toBe("unknown-tls");
  });

  it("maps an unrecognized probe code to unknown-tls", async () => {
    const res = await checkSslGuard(
      deps({ probeTls: async () => ({ ok: false, code: "ECONNREFUSED" }) }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issue).toBe("unknown-tls");
  });
});

describe("formatSslGuardLine", () => {
  it("renders an ok result as the healthy line", () => {
    expect(formatSslGuardLine({ ok: true })).toBe("✓ TLS ok");
  });

  it("renders a warning with the issue and hint", () => {
    const line = formatSslGuardLine({
      ok: false,
      issue: "self-signed",
      hint: "set NODE_EXTRA_CA_CERTS to your corporate CA bundle",
    });
    expect(line).toContain("⚠ TLS:");
    expect(line).toContain("self-signed");
    expect(line).toContain("NODE_EXTRA_CA_CERTS");
  });
});
