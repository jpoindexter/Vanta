---
name: dependency-audit
description: "Scan dependencies for known CVEs across ecosystems — npm audit, cargo audit, osv-scanner (multi-ecosystem, catches what npm audit misses), pip-audit. Triage by reachability (runtime vs dev) and severity before mass-bumping."
created: 2026-06-27
updated: 2026-06-27
tags: [security, dependencies, cve, vulnerability, npm-audit, cargo-audit, osv-scanner, supply-chain]
---

# Dependency Audit

Most of your attack surface is code you didn't write. This scan finds dependencies with **known** CVEs (the published ones — a database lookup, not analysis). The trap is reacting to the severity number alone: a 9.8 in a **dev-only test runner** is not a 9.8 in your shipped runtime. Triage by **reachability** first, severity second.

## When to run

- Before a release (a tagged version is what gets audited).
- On a schedule (new CVEs land against deps you already shipped — yesterday's clean is today's stale).
- After adding or bumping any dependency.

## Run it — one ecosystem at a time, then the cross-cutting scanner

```bash
# Node / TS — runtime only first (what you actually ship), then everything.
npm audit --omit=dev          # the deps that ship in `npm install --omit=dev`
npm audit                     # + dev/build tooling

# Rust
cargo audit                   # reads Cargo.lock against the RustSec advisory DB

# Python
pip-audit                     # or: pip-audit -r requirements.txt

# Multi-ecosystem, recursive — the thorough net. Catches lockfiles the per-tool
# audits miss (sub-projects, docs sites) and flags dev deps explicitly.
osv-scanner scan source --recursive .
```

`osv-scanner` is the most complete — it walks every lockfile in the tree (including a docs site or sub-package the per-ecosystem tools never see) and labels `(dev)` so you can triage by reachability.

## Triage — reachability BEFORE severity

For each finding, ask in order:

1. **Does it ship?** A `(dev)` dep (esbuild, vite, vitest, a linter) is NOT in your runtime if you install with `--omit=dev`. Real, but low urgency — it can't be hit by a user of the shipped artifact. Note it; don't panic-bump.
2. **Is the vulnerable path reachable?** A CVE in a code path you never call is lower priority than a medium in your hot path.
3. **THEN severity.** Among reachable, shipped deps, fix highest CVSS first.

## Remediate — least-disruptive first

1. **Patch bump** (`npm audit fix`, `cargo update -p <crate>`) — safe, same major version. Do this freely.
2. **Major bump** (vite 5→6, vitest 2→3) — a **breaking** change. Do it deliberately in its own branch with the full test suite green after, NEVER as a blind `audit fix --force` before a release.
3. **Override / pin** a transitive dep to a patched version (`overrides` in package.json, `[patch]` in Cargo) when the direct dep hasn't updated yet.
4. **Accept with a note** when there's no fix and the dep is dev-only/unreachable — record WHY in a `SECURITY.md` or an allowlist so the next audit doesn't re-litigate it. Silent acceptance reads as "missed it."

## The boundary

This finds **known, published** CVEs only — a zero-day or an unreported backdoor won't show. It's necessity, not sufficiency. Pair with `[[sast-scan]]` (your own code) and `[[secret-scan]]` (leaked credentials). Log what you deferred and why — see `[[security-preflight]]`.
