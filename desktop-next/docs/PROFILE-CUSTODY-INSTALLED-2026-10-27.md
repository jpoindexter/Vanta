# Profile and draft continuity — installed candidate

## Gap first

The bounded combined source candidate is now signed, notarized, archived,
installed and exercised at its actual installed path. This does not finish the
Desktop redesign, owner visual/per-item parity acceptance, unfamiliar-person
acceptance, live-account workflows, all dependency security or modularization.
No owner normal-profile launch or acceptance was inferred from private tests.

## Exact delivered artifact

| Field | Observed value |
| --- | --- |
| Installed application | `/Applications/Vanta.app` |
| Version | `0.1.0-local.20261027.profile1` |
| Code checkpoint | `0b06904bfedfa5bd146f009df23386bf2f493e91` |
| ASAR SHA256 | `3251f13322625f434d8bba38ea812499e7a9e9521cfb790f08dc64f34c119399` |
| Archive | `Vanta-0.1.0-local.20261027.profile1-arm64.zip` |
| Archive bytes | `231755898` |
| Archive SHA256 | `98148a3fc38452742e9bc344a85af4ae3efb7704d3d8ef1a4893c0cc3c40ab95` |
| Apple submission | `169f0070-aefe-4e49-bc20-bbee1e57124f`, Accepted |
| Declared source digest | `11cb189c069efd154466b4dcab251828bd5207da370a3126ad0b40fa2dfd2d8a`, 8222 files |
| Provenance | Dirty declared-source/assembly snapshot; explicitly not hermetic or HEAD-only |
| Installer rollback | `/Applications/.vanta-install-backups/update-tpBn3o/Vanta.app` |

The local archive is under `desktop-next/apps/desktop/release/mac-arm64/` and
retained with its report in the external delivery packet. Its contents were
regenerated after stapling and independently extracted, ticket-validated,
signature-validated and fingerprint-compared with the final app. The archive
was not uploaded as a GitHub release. This following evidence-only commit does
not change the application's code checkpoint above.

## Executed delivery

- Built the canonical renderer, main/preload, 340-chunk runtime and new release
  kernel. Staged 247 runtime packages, including Zod 4.6.7/OpenAI 6.49.0. The
  signed kernel's bytes change during signing; a raw comparison with the
  unsigned input is not a valid post-sign identity test. Assembly provenance
  binds the input, and actual scoped-state journeys exercise the signed kernel.
- Developer ID signing and `codesign --verify --deep --strict` passed.
- Apple accepted the submission; stapling, staple validation and `spctl`
  assessment passed on the candidate and on the installed application.
- The real `vanta:install -- --no-package` entry verified current source and
  package provenance, replaced only the idle app, retained rollback and updated
  the installer-owned `vanta-next` launcher. The ordinary `vanta` command and
  owner runtime/profile configuration were not rewritten.
- Installed ASAR equals the verified candidate. All 239 original repository
  work files retain their saved hashes. All 82 existing owner app-data files
  matched their pre-install backup after the installed private-profile runs.

## Actual installed behavior

The harness selected `VANTA_PACKAGED_APP=/Applications/Vanta.app`, not source
Electron or a private worker's bundle. Every run used separate HOME/app data,
throwaway projects, fresh test approvals and a deliberate loopback model.

| External receipt | Executed checks |
| --- | --- |
| `installed-profile-pool-r1/result.json` | 10: visible profile selection, ordinary chat, sticky/default distinction, distinct private kernel authority with unchanged project safety root, cross-token refusal, actual quit and exact unsent-draft recovery after restart |
| `installed-profile-effects-r1/result.json` | 7: fresh native terminal/Git approvals, other-profile and ambiguous/query-form refusal, concurrent same-ID background streams through foreground switch, actual Default child model/history routing, log-token absence |
| `installed-custody-corruption-r1/result.json` | 11: ordinary chat, exact PNG preview/persistence, corrupted/unattributed text-store warning, restart and non-clobbering recovery |
| `installed-queue-r1/result.json` | 6: queue restart custody, Edit/Cancel/Save with separate composer draft, exact image/text/ID and deliberate one-time Send now |

All four receipts pass: 34 bounded installed checks, zero renderer errors.
Packaged pre-install equivalents also passed. Source empty-history retention
passed separately; it was not rerun against the installed app. Git's actual
effect check establishes intended index state, not an independently counted
once-only Git execution. Company remains its existing primary/unbound route;
these receipts do not certify profile-owned Company or external accounts.

## Delivery failure preserved, not hidden

The original notary command accepted/stapled the app but its final ZIP verifier
failed when ordinary `ditto` extracted a framework symlink in macOS system temp.
One unchanged archive-only retry failed identically. A controlled comparison
then used the same prior ZIP: extraction failed in system temp and succeeded
in the external backup directory. This isolates a destination-dependent local
restriction; its underlying macOS policy cause is not established.

The unchanged `refreshDeliveryArchive` then passed with a private 0700 scratch
directory selected through standard `TMPDIR`. No source patch, permission
change, removed quarantine, skipped signature/ticket check or second Apple
submission was used. The final published local ZIP/report were replaced only
after that complete verifier passed. Failed logs and comparison receipts remain
in the packet. System-temp extraction itself is not claimed fixed.

## Evidence and recovery

External packet:

```text
/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/combined-desktop-20261027-E6wbNw
```

Key files: `profile-delivery-state.json`, `profile-package-r1.log`,
`profile-notarize-r1.log`, `profile-archive-r2.log`,
`profile-archive-private-scratch-r1.log`, `system-temp-extract-diagnosis.json`,
`profile-install-r1.log`, `profile1-notarized-report.json` and the receipt
directories above. `installed-before-profile/` retains the old recovery2 app
and owner data; `release-before-profile-source/` retains the prior source-release
artifacts. Git source checkpoint bundle and all reviewed pre/postimages remain.
Do not remove any of these to make the worktree look clean.

## Remaining sequence

1. Keep the existing owner visual/per-item parity, assistive/human and live-account
   decisions open. The installed build does not approve its own design.
2. Continue dependency repair in bounded slices. The Desktop workspace audit is
   19 findings (7 high/4 moderate/8 low); runtime all-dependency audit retains
   9 findings including 2 critical. Read-only artifact inspection found no
   demonstrated flagged-version path in this candidate's 247-package runtime
   closure, but that is not an exploit-absence or whole-security proof. Detailed
   next slice: external `dependency-reachability-review-2026-10-27.md`.
3. Continue proven session/state/gateway/native modularization without baseline
   suppression, capability deletion or replacing the app architecture.

Roadmap IDs, statuses, Done criteria and dependencies remain unchanged. No main
merge, release/tag, paid service, CI enablement or legacy capability removal.
