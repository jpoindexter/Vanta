# security-skills

A small, opinionated pack of **agent skills for running security scans** — secret scanning, dependency CVE auditing, SAST, and a composed pre-release gate. Each skill is a plain-Markdown `SKILL.md` with frontmatter: drop it into any agent that reads skills ([Vanta](https://github.com/jpoindexter/Vanta), Claude Code, Codex, anything skill-aware), or read it yourself as a runbook.

These aren't generated prose. Each skill is grounded in a scan that was actually run against a real Rust + TypeScript codebase, and each carries the part that tooling tutorials skip: **how to triage the output** (reachability before severity, source→sink before fixing) and **the boundary** (what the scan does *not* establish).

## The skills

| Skill | Scans | What it adds beyond "run the tool" |
|-------|-------|------------------------------------|
| **[secret-scan](secret-scan/SKILL.md)** | `gitleaks` (full history + staged) | Rotate-first-then-scrub order; history is forever; allowlist vs disable |
| **[dependency-audit](dependency-audit/SKILL.md)** | `npm audit`, `cargo audit`, `osv-scanner`, `pip-audit` | Triage by **reachability** (runtime vs dev) before severity; least-disruptive remediation |
| **[sast-scan](sast-scan/SKILL.md)** | `semgrep`, `codeql` | Trace **source → sink** before fixing; per-line suppress with a why, never blanket-ignore |
| **[security-preflight](security-preflight/SKILL.md)** | composes the three | One pass/triage gate before going public or tagging a release — the security sibling of `ship-preflight` |

## Install

**Vanta** auto-installs any skill library on the repo root list — clone next to your repos and it picks them up, or copy in:

```bash
git clone https://github.com/jpoindexter/security-skills
cp -r security-skills/*/ ~/.vanta/skills/        # global install
```

**Claude Code / Codex / other** — copy the skill dirs into your skills directory (e.g. `~/.claude/skills/`); they're standard `SKILL.md` files.

**As runbooks** — just read them. Every command is copy-pasteable.

## Design principles

- **Grounded, not generated** — every command was run against a real codebase before it went in the skill.
- **Triage is the skill** — running the scanner is one line; knowing which of 11 findings actually matters is the value.
- **Honest boundaries** — each skill states what its scan does NOT catch. A green scan is necessary, never sufficient.
- **Rotate first** — for secrets, the order is non-negotiable: revoke at the provider, *then* scrub history.

## License

[MIT](LICENSE). Contributions welcome — add a `<slug>/SKILL.md` for another scan (container/IaC via `trivy`, license compliance, IaC misconfig) and open a PR.
