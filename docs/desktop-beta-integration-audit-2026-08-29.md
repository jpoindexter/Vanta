# Vanta Desktop beta integration audit — 2026-08-29

## Verdict

The stacked source, roadmap, and exact local packaged candidate are locally green.
The two human acceptance outcomes are not complete because no qualifying unfamiliar
participant run occurred. The branch is suitable for a draft integration review,
not merge, release, deployment, or a shipped beta claim.

## Git boundary

- Base branch: `codex/desktop-operator-dossier-20260826`.
- Base SHA: `7fe12e14c77a3a3f6c8e969bbdf537538930be8e`.
- Integration branch: `codex/hermes-beta-integration-20260829`.
- Roadmap reconciliation commit before this audit:
  `e758160ca97b7d16bcaf01679712370cbbdae388`.
- `origin/main` at the frozen comparison:
  `4911ae44bbb35beef4511ba298475ba5a82b7e1c`.
- GitHub Actions remained disabled.
- Existing branches, worktrees, tags, installed Vanta, and `main` were not changed.

## Roadmap result

- 1,341 unique cards.
- 1,288 shipped, 2 Next, 8 Horizon, 43 Parked.
- Next is dependency-ordered: operator dossier, then cold-operator proof.
- MCP explicit-empty and semantic accessibility are shipped from retained executed
  evidence.
- Operator dossier and cold-operator proof remain Next.
- `GROW-01` remains Horizon and zero-cost.

## Executed local gates

| Gate | Exit | Result and boundary |
| --- | ---: | --- |
| `npm ci` in `vanta-ts` | 0 | 657 packages; npm audit reported 0 vulnerabilities. |
| Runtime TypeScript typecheck | 0 | Passed. |
| Renderer TypeScript typecheck | 0 | Passed. |
| TypeScript 7 compatibility | 0 | 1 test passed. |
| Focused MCP and dossier tests | 0 | 5 files, 36 tests passed. |
| Full TypeScript suite | 0 | 1,555 files; 14,275 passed; 3 skipped. |
| `cargo test` | 0 | 70 passed; inherited unused-import warning. |
| Roadmap generation, build-order test, duplicate/dependency/cycle validation | 0 | 1,341 unique cards; zero missing dependencies or cycles. |
| Production website build | 0 | Docusaurus build passed after the affected-image signature gate disabled and rejected the unpatched parser formats. |
| Signed packaged accessibility proof | 0 | Source and packaged shell plus queue passed; eight surfaces each had zero serious findings; metadata 12px; controls 36px; focus 2px solid; reduced motion active. |
| Keyboard-only VoiceOver proof | 0 | Attachment, Review, allow-once approval, and result reached with zero pointer input. |
| Visual regression proof | 0 | Four comparator tests and 48 exact captures passed with no missing or orphaned baselines. |
| Dossier interaction smokes | 0 | Shell, queue, runtime disclosure, model/runtime states, recovery, narrow layout, and draft persistence passed. |
| Semgrep | 0 | 200 rules over the changed generator; zero findings. |
| Complete-history and snapshot secret scan | 0 | 2,176 commits and 21.57 MB repository-owned snapshot; zero findings. |
| Protected-path and high-confidence credential scan | 0 | No protected Rust, factory, `MANIFESTO.md`, or credential-pattern change. |
| `git diff --check` | 0 | No whitespace errors. |
| Website dependency audit | 0 bounded gate | Two upstream advisories expand through 19 packages; affected parsers disabled, build inputs clean, any new advisory fails, exception expires 2026-10-01. Raw `npm audit` remains non-zero. |

## Dependency hardening follow-up

The raw website audit still reports the two upstream `image-size <=2.0.2`
denial-of-service advisories through 19 Docusaurus nodes. No patched npm release
exists, and npm's proposed force-fix is a breaking search-plugin downgrade.
Vanta therefore applies a bounded mitigation rather than hiding the scanner:

- the Docusaurus process disables `heif`, `icns`, `jxl`, and `jxl-stream`;
- the prebuild gate identifies ICNS, JPEG XL, and HEIF/AVIF by bytes, including
  a misleading file extension, and stops before Docusaurus reads the input;
- seven regression tests cover clean audit, exact exception, unexpected
  advisory, registry failure, signature detection, disguised input, and all
  four disabled parser identifiers;
- `npm run security:dependencies` accepts only the two named advisories, fails
  on any other advisory or incomplete audit, pins the reviewed 2.0.2 graph, and
  expires on 2026-10-01;
- a production build and local static server returned HTTP 200 for `/`,
  `/security`, `/acceptance`, and `/roadmap`; the served security and roadmap
  copy matched the current source.

This is executed mitigation of the reachable build path, not an upstream package
fix and not a zero-advisory claim. OSV still reports the same two no-fix package
records; the static site sent to visitors contains neither Docusaurus nor
`image-size`.

## Candidate artifact

- `Vanta.app/Contents/MacOS/Vanta`: 52,544 bytes;
  SHA-256 `fc6fa00534695add66ea5d80b83f15b4b0e9a8a68c5d5b17815f7a0147ac00aa`.
- `Vanta.app/Contents/Resources/app.asar`: 129,186,738 bytes;
  SHA-256 `162a07d5efa8ae6f1632a403e16663a9a62ce89e18c138c04118e0f47e5e9cc5`.

These hashes bind the local candidate, not a notarized or published distribution.

## Remaining acceptance

The mechanical cold-start rehearsal is not a human comprehension result. A voluntary,
uncompensated person unfamiliar with Vanta must execute the packet in
`docs/desktop-cold-operator-test-packet-2026-08-29.md`. Until then:

- `DESKTOP-OPERATOR-DOSSIER-HIERARCHY` remains Next;
- `DESKTOP-COLD-OPERATOR-RELEASE-PROOF` remains Next;
- no operator-dossier or cold-operator checkpoint tag is valid;
- no beta, merge, release, deployment, or user-outcome claim is valid.
