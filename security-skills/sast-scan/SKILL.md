---
name: sast-scan
description: "Static application security testing of YOUR code (not deps) — semgrep with the security rulesets, CodeQL for deeper dataflow. Find injection, path traversal, unsafe exec, hardcoded crypto. Triage false positives by tracing reachability, don't blanket-ignore."
created: 2026-06-27
updated: 2026-06-27
tags: [security, sast, semgrep, codeql, static-analysis, injection, taint]
---

# SAST Scan

Dependency audits cover code you imported; SAST covers code you **wrote**. It pattern-matches (and, with taint mode, traces dataflow) for the classic flaws: command/SQL injection, path traversal, unsafe deserialization, `eval`/dynamic exec on untrusted input, hardcoded crypto, missing auth checks. High false-positive rate is inherent — the discipline is **triage by reachability**, not blanket-ignore.

## When to run

- Before a release, on the diff or the whole tree.
- When you add code that handles untrusted input (a new tool, an endpoint, a parser, a shell-out).
- In CI on PRs (diff-scoped, so it's fast and only flags new issues).

## Run it

```bash
# semgrep — the security rulesets. `auto` picks rules from the detected languages.
semgrep scan --config auto --error .

# Focused, higher-signal rulesets (less noise than auto):
semgrep scan --config p/security-audit --config p/secrets --config p/command-injection .

# Diff-only (CI on a PR — fast, only NEW findings):
semgrep scan --config auto --baseline-commit origin/main .
```

For deeper dataflow (does untrusted input actually REACH the sink?), CodeQL is stronger but heavier:

```bash
codeql database create db --language=javascript    # or rust, python, …
codeql database analyze db --format=sarif-latest --output=results.sarif \
  codeql/javascript-queries:codeql-suites/javascript-security-extended.qls
```

## Triage — trace, don't dismiss

For each finding, trace the **source → sink** path:

1. **Is the input attacker-controlled?** A `child_process.exec` on a hardcoded constant is fine; on a request param it's a command-injection bug. semgrep flags the sink; YOU confirm the source.
2. **Is there a sanitizer between them?** If the value is validated/escaped (a zod schema, an allowlist, a parameterized query) before the sink, it's a false positive — mark it `# nosemgrep: <rule-id>` **with a one-line why**, not a bare ignore.
3. **Real?** Fix at the source (validate/escape the input) or the sink (parameterize, use the safe API), not by suppressing the warning.

Never blanket-disable a rule to clear the board — you'll suppress the one real hit among the noise. Suppress per-line, with a reason.

## What to actually fix (highest value first)

- **Injection** (command/SQL/template) on any user-reachable path — the highest-severity, most-exploited class.
- **Path traversal** — unvalidated paths reaching file reads/writes (an agent that writes files is exactly this risk; gate on a scope check).
- **Unsafe exec/eval** of dynamic strings.
- **Hardcoded crypto / weak randomness** in a security context.

## The boundary

SAST sees one repo's source statically — it can't see runtime config, an env-driven code path, or a flaw that only emerges across a service boundary. It complements, never replaces, a real threat model and `[[dependency-audit]]`. For an agent/tool runtime, the strongest control is often architectural (a kernel that gates every action) rather than per-line — SAST validates the code AROUND that boundary. Fold it into `[[security-preflight]]`.
