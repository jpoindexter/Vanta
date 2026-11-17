# js-yaml patch checkpoint — 2026-10-25

## Scope and result

The existing `node_modules/js-yaml` lock entry changes from 4.3.1 to 4.3.2 in
`desktop-next`, `vanta-ts` and `vanta-website`. Only version, resolved tarball URL
and official integrity change in each lock. No manifest, override, package range,
development marker, application source or permission policy changes.

This addresses the empty-merge-source CPU-budget bypass in
[GHSA-2883-xcg3-v3hh](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh).
It is one advisory across three dependency trees, not complete security closure.
Existing DN-DEP and `DESKTOP-NEXT-CUTOVER` retain their broader acceptance gates.

## Executed proof

- Current shared lock preimages matched all three reviewed SHA-256 values.
  After applying the patch, deep comparison proves every other lock field is
  unchanged. Patched bytes exactly match the independently installed candidate.
- Both official package tarballs match registry SHA-512 integrity and verify
  against registry ECDSA signatures. No provenance attestation was advertised;
  registry verification is not a claim that package source is harmless.
- A bounded 62-byte YAML input containing eight empty merge sources with a
  budget of one is accepted by old 4.3.1 and rejected by 4.3.2. Ordinary anchors
  and dump/load round trips pass on both published artifacts.
- Three independent, physical dependency trees were installed from an exact
  `71cf90cf` snapshot with only these lock changes. All three clean `npm ci`
  runs exit zero with lifecycle scripts disabled. No legacy-peer-deps flag,
  copied upstream lock, phantom workspace repair or shared dependency tree was
  needed. These observations supersede older workaround claims for this slice
  only; they do not establish that every install environment is repaired.
- The actual resolved parser is 4.3.2 inside each private tree. The same bounded
  advisory and ordinary controls pass through those installed instances.
- Actual Electron Builder YAML configuration loaders 27.0.0-alpha.6 and
  26.15.3 load the ordinary fixture with expected metadata and output path.
- Desktop packaging fixtures pass 26/26; runtime package policy passes 2/2.
  These are fixture checks, not another signed app delivery.
- The isolated website's normal prebuild and Docusaurus production build exit
  zero. All 13 existing manifests and locks remain byte-identical to their
  patched pre-install state after installation and site generation.

Parent repeated the parser/configuration and 28 packaging/policy checks before
integration. Original clean-install and website logs were read, not represented
as additional fresh builds. Package lifecycle scripts remain unexecuted.

## Lock-audit boundary

The retained before/after lock audits report:

| Dependency graph | Before | Patched candidate |
| --- | --- | --- |
| Desktop, all | 26: 14 high, 4 moderate, 8 low | 25: 13 high, 4 moderate, 8 low |
| Runtime, all | 16: 2 critical, 12 high, 2 moderate | 15: 2 critical, 11 high, 2 moderate |
| Website, all | 55: 19 critical, 14 high, 18 moderate, 4 low | 54: 19 critical, 13 high, 18 moderate, 4 low |
| Runtime, production | 6: 5 high, 1 moderate | Unchanged: 6: 5 high, 1 moderate |

These graphs overlap and must not be added together. GitHub default-branch
alerts are a separate graph and are not cleared by pushing an integration
branch. Source locks do not certify installed dependencies or future advisories.

The parent's later audit refresh compares the exact old locks with the patched
ones against the then-current registry feed: Desktop **23 to 22** (10 high,
4 moderate, 8 low after); runtime-all **16 to 15** (2 critical, 11 high,
2 moderate after); website lock-only **55 to 54** (19 critical, 13 high,
18 moderate, 4 low after). Each retains other findings and exits one. Only the
js-yaml finding is removed by this patch. These later totals supersede the
earlier snapshot totals for those specific graphs, not their retained history.

The populated website consumer audit instead reports 53: its additional
missing `cheerio` meta-finding is absent despite byte-identical locks and an
unchanged `undici` advisory list. Repeating the patched audit in a manifest/lock
copy with no installed dependency tree restores that finding and reports 54.
Do not count that environment-sensitive reporting difference as another fix.
All before/after raw JSON reports are retained with the external evidence.

## Delivery and preservation

Shared `node_modules` were not replaced: the shared Desktop/runtime parser
instances still require a later clean install to consume the new locks. The
installed notarized app remains `71cf90cf`, version
`0.1.0-local.20261025.recovery2`; this lock-only patch does not relabel it.

Read-only inspection of that installed ASAR found no standalone js-yaml or
electron-updater paths, and its loose runtime has no top-level js-yaml package.
That is inventory evidence, not complete bundled-code reachability proof. No
claim about a live updater or shipped-runtime exploitability follows from the
manifest's production declaration alone. No unnecessary replacement app was
installed for this build/configuration dependency patch.

External recoverable evidence directory:
`Vanta-backups/jsyaml-integration-20261025-rtc2bj/` (sibling of the checkout).
It contains exact preimages, the frozen patch and registry/parser evidence,
consumer fixtures/logs/results and a hash inventory of all 239 pre-existing
dirty regular files. Every listed dirty file remained unchanged during this
integration. No owner profile, credential, protected source or legacy
capability was modified.

Patch SHA-256:
`e77686bf752b1c39149ccf644f8087e6fd32ddd7c4030e8d79e22e223b4920c5`.
No main merge, public tag/release, CI activation, deployment or paid service.

## Re-entry

Continue the [runtime security compatibility batch](../desktop-next/docs/RUNTIME-SECURITY-REENTRY-2026-10-25.md),
not a forced Zod/OpenAI major override. Preserve the independent
[unified-design migration](../desktop-next/docs/UNIFIED-DESIGN-2026-10-25.md)
and its per-surface owner visual acceptance. This security slice closes neither
the whole Desktop nor the whole dependency/security goal.
