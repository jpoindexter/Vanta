# Website sanitizer checkpoint — 2026-10-28

**Locally built and browser-checked; not deployed, not security-green.**
Only the website's existing DOMPurify lock entry changes from 3.4.13 to 3.4.17:
version, official tarball URL and integrity. All 1,489 package records, other
resolved fields, consumer ranges, overrides and the website manifest remain
unchanged. No app/runtime dependency, installed app or normal CLI selection changes.

## Executed acceptance

- Private source snapshot of `c9fe716ba8b52fed70d1abea3a1b88a23f998d36` plus the
  exact leaf proposal; empty private npm configuration/HOME/cache, no owner credentials.
- Ordinary `npm ci --ignore-scripts --no-audit --no-fund` installs 1,432 packages
  with normal lock integrity enforcement. No lifecycle hook, peer workaround,
  copied upstream lock, forced upgrade or canonical node_modules installation.
- Actual installed resolution: Docusaurus theme-mermaid 3.10.2 → Mermaid 11.16.1
  → DOMPurify 3.4.17, including Mermaid's ESM import. All 24 sanitizer files match
  the earlier tested leaf. Manifest and candidate lock hashes remain unchanged.
- Unmodified `npm run build`, including image parser/input protection, roadmap
  generation, model-catalog synchronization and installer copying, succeeds.
- Serve that production build on private loopback. Actual headless Chrome loads
  `/graph-engineering` with HTTP 200 and the expected heading, then renders one
  visible hydrated Mermaid SVG with nonzero dimensions/viewBox and expected
  Planner, Researcher A, Human approval, Executable gate, Done and Escalate labels.
  Reload repeats the same checks. No raw Mermaid block, syntax error, page error
  or failed request; both screenshots retained and first-load image inspected.
- Eight focused dependency-audit/image-build checks pass. The old exception test
  was reproduced failing against the unchanged baseline because it used today's
  date after the October 1 expiry. It now supplies an explicit pre-expiry date;
  a new boundary/later-date check proves rejection remains. Production exception
  policy, allowed advisories and expiry are **unchanged**; no risk was reaccepted.

These build/browser/eight-test runs use the isolated installed tree. The canonical
website intentionally still has no node_modules; a direct test there cannot
resolve image-size. Exact source/test byte comparison binds the private proof to
the proposed files without installing over owner dependencies.

## Evidence and exact identity

Private retained packets under `docs/Vanta-backups/` outside the application repo:

- `website-dompurify-20261027-FOXmyM`: frozen proposal, official metadata, exact
  lock comparison, real sanitizer/Mermaid caller checks and raw paired audits.
- `website-build-20261028-SHy4ca`: source archive, manifest/lock identities,
  source preimages, dependency install/build/test logs and browser JSON/screenshots.

Website manifest SHA-256:
`74fe14a2d64b437b921908bb98c9b1ccaeab57c57e2e16840b4cc9feb56a6d7a`.
Old lock: `020b94de6c020bbb33d1023f96d0470ed0304d34a466569b5a0535500d942ecb`.
New lock: `ff76ef41f80f77c678074a2b9e1d93baeed1ebba39029be552d5f202c892298c`.

The [official release](https://github.com/cure53/DOMPurify/releases/tag/3.4.17)
and [reviewed advisory](https://github.com/advisories/GHSA-cg2g-xh64-v4q7)
identify the patched version. The specific critical advisory needs template-safe
DOM/shadow-root output plus downstream evaluation; that website exploit path was
not established. A version-contract RED check is not an exploit reproduction.

The retained matched October 27 production lock-only audit pair is 42 → 41 rows,
critical 19 → 18, with all other rows deeply equal; only DOMPurify disappears.
The earlier raw pair was 40 → 41 because unchanged AJV/Cheerio meta-rows were
newly propagated by the audit cache; both raw results are retained. These dated
counts are not a new full security assessment or GitHub default-branch closure.

## Remaining gates

Other website/Desktop/runtime and older-default-branch dependency findings remain.
The image-size exception is expired and the production audit policy still rejects
it; parser/input mitigation and passing fixture tests do not renew that acceptance.
No deployed website, public release, main merge, CI/paid service, live-account,
whole Desktop parity or owner visual/human acceptance is claimed. Website-only
changes do not require rebuilding/replacing the separately accepted agent4 app.

Keep existing cards open and preserve all IDs/statuses/Done criteria/dependencies.
Exact rollback is the retained one-lock/test preimage; original work, app/data,
CLI selection and app rollback remain untouched. No files were deleted.
