# Transcript math dependency repair — 2026-10-29

## Source result and authority boundary

Desktop pins KaTeX `0.18.2` instead of `0.16.47`; the root override also keeps
Streamdown, rehype, Mermaid and micromark from resolving an older copy. Only the
workspace dependency, root override and four lock fields change. The historical
extraneous bootstrap record and unrelated dependencies remain untouched.

This repairs [GHSA-238p-pmpm-9mq7](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-238p-pmpm-9mq7),
which the maintainer fixes in [0.18.2](https://github.com/KaTeX/KaTeX/releases/tag/v0.18.2).
It concerns inherited renderer permission after some other code has already
polluted a prototype. No attacker-controlled Vanta pollution entry point or
browser script execution was established. Ordinary links still require their
existing user interaction; no browser or approval boundary is loosened.

The actual transcript uses `createMemoizedMathPlugin` and `katex.renderToString`.
With a test-only inherited `trust:true`, the old production component renders a
clickable harmless test link. The patched component rejects that inherited
permission. Explicit trusted/denied library controls retain their intended
behavior; the application itself does not opt into trusted math rendering.

## Executed evidence

- Both published tarballs pass registry signature and SHA-512 integrity checks.
  The clean installed patch matches all 213 registry package files; unchanged
  nested CLI dependency files are retained separately in the installed tree.
- Isolated old/new processes distinguish inherited options and prototype trust,
  preserve four explicit permission controls and twelve ordinary inline/display
  renders. No link is clicked or external resource fetched.
- The old real transcript test has one permission failure and one ordinary-math
  pass. The patch passes thirteen focused checks across transcript, file-preview
  math and prose, plus full Desktop typecheck and renderer/Electron/runtime build.
- A fresh manifest-only directory installs 1,040 packages with lifecycle scripts
  disabled and no copied dependency tree. All resolved KaTeX callers use 0.18.2.
- Actual isolated source Electron/backend/model streaming renders two replies
  with the exact inline/display annotations, rejects inherited link permission
  and loads local math fonts. Cached repeat rendering remains safe; no observed
  renderer errors or external requests. Both replies also decode real Mermaid
  math diagrams through its patched transitive caller. Shared activation passes the two new
  real-component regression checks.

These are conditional benign controls and bounded compatibility checks, not a
complete exploit chain, whole-product security review or owner visual acceptance.
The private packet is `dependency-runtime-20261029-NlJfzU`.

## Audit delta and preservation

Near-simultaneous manifest/lock-only audits use the same registry and private
no-credential configuration. Only this advisory identity disappears:

| Desktop graph | Before | After |
| --- | --- | --- |
| Production | 11: 3 moderate, 8 low | 3 moderate |
| All | 17: 6 high, 3 moderate, 8 low | 9: 6 high, 3 moderate |

The eight removed affected/meta-package entries are not eight independent
vulnerabilities fixed. Both remaining audits exit one; graphs overlap and must
not be summed. Separate current runtime npm graphs report zero known findings;
website graphs still report 32. These are database observations, not security
clearance or a resolution of the unmerged default branch's GitHub alerts.

The verified shared parser is activated recoverably; all 225 files of the prior
shared package remain backed up. Installed agent17 and normal CLI12c05ed5 stay
unchanged. Already-running processes do not hot-upgrade. A subsequent signed,
notarized, installed candidate needs its own exact delivery evidence.

## Retained failures and limits

The first primitive fixture accidentally made inherited trust read-only, which
prevented either constructor from assigning its own setting; a writable test
property corrects that fixture. A wrong test working directory prevented Babel
resolution and ran zero tests. A same-line display fixture was corrected to the
documented multiline delimiter before establishing the ordinary control.

The first two source-app replays stopped before the model: the isolated clone
lacked its checkout kernel, which the launcher intentionally selects instead of
an ambient override. A provider-config hypothesis was not the cause. The exact
existing kernel was copied into the private clone without Rust edits; fixture
SSE delimiters were corrected separately. Another replay passed its first reply
then assumed an aggregate error-markup count; semantic math annotations replace
that invalid assertion. Original drivers/failures remain; no production gate was
changed to make a test pass.

No full suite, owner/live-account acceptance, main merge, public release/tag,
paid service/CI, protected-source edit, credential migration, legacy retirement
or card/parent completion is claimed.
