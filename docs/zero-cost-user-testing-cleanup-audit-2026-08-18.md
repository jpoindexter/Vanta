# Zero-cost user-testing cleanup audit

Date: 2026-08-18

## Decision

Vanta's sole dependency-ready `Next` outcome is the first cold-operator release proof. It uses a voluntary, zero-cost, non-developer participant and must preserve informed consent, accessible support, the right to stop, and the prohibition on sensitive-account data.

`GROW-01` is deferred to `Horizon`. It authorizes no participant payment, paid recruiting, paid research platform, mass outreach, enrichment, CRM, billing, analytics, hosting, CI spend, or source implementation. If it begins later, evidence from an uncompensated volunteer cohort must state its selection and representativeness limits.

## Roadmap reconciliation

- Canonical source: `roadmap.json`, updated 2026-08-18.
- Records: 1,331 total and 1,331 unique.
- States: 1,286 shipped, 37 parked, 1 next, and 7 horizon.
- Dependency validation: zero missing dependencies, zero self-dependencies, and zero cycles.
- Generated build order and website projection were regenerated from the canonical source.

## Repository preservation and cleanup

- The active stack remains 78 commits ahead of `origin/main` and zero commits behind.
- Four inherited dirty worktrees containing 160 entries were backed up outside the repository, reconciled, and returned to clean status without discarding their contents.
- Five unpublished legacy branches were retained as explicit local archives. They were not pushed because their changes are already represented by, superseded by, or intentionally excluded from the consolidated stack.
- Superseded draft PRs #26 and #27 were closed only after confirming their heads are ancestors of draft PR #28. Their commits and remote branches were not deleted.
- Draft PRs #28 and #29 remain open and unmerged. PR #28 still requires independent approval.
- GitHub Actions remains disabled. No paid workflow, participant service, research platform, deployment, publication, or release was used.

## Executed verification

| Gate | Result | Evidence boundary |
|---|---:|---|
| Runtime typecheck | Pass | Exit 0 |
| Desktop renderer typecheck | Pass | Exit 0 |
| TypeScript compatibility | Pass | 1/1 |
| Startup compile | Pass | Exit 0 |
| Full TypeScript suite | Pass | 14,171 passed, 3 skipped, 0 failed across 1,538 files |
| Rust tests | Pass | 70 passed, 0 failed; one inherited protected-source dead-code warning |
| Desktop production build | Pass | 1,648 modules transformed |
| Packaged macOS application | Pass | Package built; on-disk signature and designated requirement validated |
| Website typecheck and production build | Pass | Exact lockfile dependencies installed; static build generated |
| Roadmap generator tests | Pass | 1/1 |
| Realignment validator mutation tests | Pass | 7/7 |
| Roadmap graph | Pass | 1,331 unique; zero missing, self, or cyclic dependencies |
| Runtime dependency audit | Pass | Zero vulnerabilities |
| RustSec | Pass | Zero advisories in the lockfile |
| Proposed-file Semgrep scan | Pass | 39 rules over 11 files; zero findings |
| Complete-history and repository snapshot secret scan | Pass | Complete Git history and current tracked/non-ignored snapshot; zero findings |
| Protected/forbidden-path scan | Pass | No protected Rust, factory, `MANIFESTO.md`, `.vanta`, quarantine, recovery, Hermes, or Nightcode path in the proposed change |
| Whitespace validation | Pass | `git diff --check` exit 0 |

## Honest remaining boundary

The website dependency audit reports 19 high-severity paths to two denial-of-service advisories in `image-size`, inherited through the latest Docusaurus release. Upstream currently provides no non-breaking patched version; the audit's offered `--force` operation would install a breaking downgrade. This cleanup does not hide, waive, or force-mutate that dependency risk.

This checkpoint is locally validated but not merged. It does not satisfy PR #28's independent-review requirement, publish a release, or prove a real participant outcome. The next real product evidence remains the voluntary cold-operator run described by the sole `Next` card.
