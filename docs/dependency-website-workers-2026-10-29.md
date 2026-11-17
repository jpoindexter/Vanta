# Website worker-pool security patch — 2026-10-29

## Scope and result

The website now overrides only Docusaurus core 3.10.2's Tinypool dependency to
2.1.2. This is a deliberate, scoped 1.x → 2.x change, not a blanket audit fix or
Docusaurus upgrade. The exact patched archive and registry signature are verified;
all fourteen installed package files match that artifact. Every unrelated lock
entry is unchanged. The website's security-test command includes the retained
worker regressions.

The two upstream advisories cover inherited worker options and inherited
per-task filenames, requiring an existing prototype-pollution primitive:
[worker options](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) and
[run options](https://github.com/advisories/GHSA-85c8-ppgw-ccpr).
No upstream pollution entry point or public-site compromise is established here.
The current consumer is Docusaurus's build-time static-generation worker pool,
not a web-request handler in the published static site.

Tinypool 2.1.2 supports Node 20 and 22+; unlike 1.1.1 it excludes Node 18 and 21.
This execution uses Node 22.23.1. The website already requires Node 20+, but that
does not establish compatibility with every permitted odd-numbered Node version.
The version-scoped override must be reassessed when Docusaurus is upgraded.

## Executed behavior

- Ordinary `npm ci --ignore-scripts` installs 1,432 packages in an independent
  checkout, without force/legacy-peer flags or a copied upstream lock. Manifest
  and lock are structurally checked: only the scoped override and test command,
  plus Tinypool's version, URL, integrity and engine fields differ.
- Three isolated, benign probes simulate inherited `execArgv`, `env` and
  `filename`. The original 1.1.1 runs the probe preload or substitute worker;
  2.1.2 ignores all three. Parent prototypes and owner state are not modified.
  This proves these dependency-level boundaries, not absence of all pollution.
- The five new tests also exercise queued, concurrent Docusaurus-shaped tasks,
  worker recycling and termination. All eight existing website security checks
  remain passing; the configured command runs all thirteen successfully.
- Explicit prebuild runs image-input protection, roadmap generation, model
  catalog synchronization and bootstrap copying. The ordinary Docusaurus build
  then succeeds with two workers selected by environment, no site-config edit.
  Worker/task logs show both workers rendering six batches totaling 59 routes.
- The actual private Docusaurus static server returns five representative pages
  and all three JavaScript/CSS assets those pages reference. This is HTTP/static
  artifact proof, not browser hydration, live deployment or Desktop acceptance.
- The new regression file passes strict file/function/parameter/complexity checks.

## Audit result and limits

Near-simultaneous lock-only audits use the same registry and private,
credential-free configuration. Production and all-dependency scopes each show:

| Severity | Before | After |
| --- | ---: | ---: |
| Critical | 16 | 0 |
| High | 6 | 6 |
| Moderate | 2 | 2 |
| Low | 9 | 24 |
| Total affected package entries | 33 | 32 |

Only the two Tinypool advisory identities disappear; no advisory is added and
all remaining direct advisory objects are identical. Fifteen Docusaurus package
entries remain, now inheriting lower-severity findings rather than Tinypool's
critical severity. Do not describe this as sixteen independent flaws fixed.
The two audit scopes overlap and must not be summed. Both still exit one;
the dependency security gate is not cleared and no exception was extended.
Desktop findings and GitHub default-main alerts are separate and remain open.

## Proof failures retained

The first probe harness incorrectly inherited `--input-type=module` into worker
file execution and defined pollution keys read-only. File-based child probes
with writable keys corrected those harness artifacts; the corrected old control
fails specifically by executing each benign injection, while the patch passes.
An initial build wrapper expected an optional creation log that Docusaurus did
not emit; actual worker/task evidence replaces that assertion. The first HTTP
probe assumed quoted, attribute-free HTML and was replaced with the installed
HTML parser. No production code or security assertion was relaxed to hide a
failed consumer behavior. The initial successful build and final full prebuild/
build logs, corrected old control and raw audits are retained.

## Preservation and remaining gates

Original integration/legacy CLI/owner-data files and all 47 dirty entries remain
preserved, with preimages, independent source, signed archives, logs and a Git
delta backup retained. Source documentation and DN-DEP record this checkpoint
without changing card status, checklist, Done criteria or WIP.

No shared website dependency install, live deployment, main merge, release/tag,
installed-app or normal-CLI replacement, paid service/CI, protected-source edit
or authority expansion occurs. Remaining website advisories, stale public
release/download copy, Desktop security, trust/review clearing, modularization
and owner/parity/human/live-account/native/voice acceptance remain open.
