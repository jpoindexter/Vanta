---
name: security-preflight
description: "The composed security gate before going public or cutting a release: secret-scan + dependency-audit + sast-scan, in order, with a clear pass/triage report. The security sibling of ship-preflight — refuses to wave through unrotated secrets or shipped-runtime CVEs."
created: 2026-06-27
updated: 2026-06-27
tags: [security, preflight, gate, release, audit, secrets, cve, sast]
triggers: [{"event":"PreToolUse","match":"git_push"}]
---

# Security Preflight

One gate that runs the three scans in the order that matters and gives a single pass/triage verdict. The sibling of `ship-preflight` (which proves it *works*) — this proves it's *safe to expose*. Run it before a repo goes public and before any release tag. It is a **gate, not a fix-all**: it surfaces and blocks on the things that must not ship; remediation is the individual skills.

## When to run

- **Before a repo goes public** (history becomes world-readable — the irreversible moment).
- **Before any release tag** (the audited artifact).
- **Before a force-push or history rewrite** (you're about to make the old state canonical or gone).

## The gate (run in order, stop on a hard-fail)

```bash
# 1. SECRETS — hard gate. A live secret in history blocks everything.
gitleaks detect --no-banner --redact
git ls-files | grep -iE '(^|/)\.env$|\.pem$|id_rsa|credentials|api-token|\.key$'   # tracked-file check

# 2. DEPENDENCY CVEs — gate on SHIPPED-runtime highs; dev-only are notes.
npm audit --omit=dev                       # runtime deps (the ones that ship)
cargo audit                                # Rust
osv-scanner scan source --recursive .      # multi-ecosystem, labels (dev)

# 3. SAST — your own code; gate on injection/traversal on reachable paths.
semgrep scan --config p/security-audit --config p/secrets .
```

## The verdict (report this shape)

```
Security preflight:
  secrets       — PASS (0 leaks, <n> commits) | FAIL (<what> — ROTATE then scrub)
  deps (runtime)— PASS | FAIL (<pkg> <cve> <severity> — patch/override)
  deps (dev)    — <n> notes (dev-only, unreachable by shipped artifact)
  sast          — PASS | <n> findings (triaged: <real>/<false-positive>)

Overall: SAFE TO EXPOSE | BLOCKED on <which gate>
```

## Pass / fail rules (don't soften them)

- **Any live secret in history** → BLOCKED. Rotate at the provider first (`[[secret-scan]]`), then scrub. Never "we'll rotate later."
- **A shipped-runtime CVE at high/critical** → BLOCKED until patched, overridden, or its unreachability is proven and recorded.
- **Dev-only / docs-site CVEs** → NOTES, not blockers (the shipped artifact via `--omit=dev` doesn't include them) — but **log them**, with the reason they're deferred. Silent omission reads as "covered everything."
- **SAST injection/traversal on a user-reachable path** → BLOCKED until fixed at source or sink. False positives → per-line suppress with a why (`[[sast-scan]]`).

## Honesty rules (the whole point of a gate)

- Report what each scan does **NOT** establish: gitleaks misses word-shaped secrets; audits miss zero-days; SAST misses cross-service and runtime-config flaws.
- A green gate is **necessary, not sufficient** — it doesn't replace a threat model.
- Never mark "safe to expose" if a scan was skipped, errored, or only partially ran. Say what you skipped, first.

## Composes

`[[secret-scan]]` · `[[dependency-audit]]` · `[[sast-scan]]`. Mirror of `ship-preflight` (functional gate) — run both before a release.
