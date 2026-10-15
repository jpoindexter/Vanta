# TRUST-02 Bounded Closure Audit

Date: 2026-08-02

Branch: `codex/trust-02-closure-20260802`

Verified source head: `590126e9aaad261768374d920ccd3d71a652cd85`

Observed remote `main`: `4911ae44bbb35beef4511ba298475ba5a82b7e1c`

## Verdict

The bounded `TRUST-02` roadmap contract is satisfied on Vanta's supported
packaged Darwin ARM64 path and is promoted from `building` to `shipped`.

The exact written Done path was executed again from the current stacked source
head after the Desktop reliability and local continuity work. Nine hostile or
unauthenticated Desktop/API requests were denied, synthetic credential and audit
values remained outside model-visible results, the complete hook payload was
denied or exact-approved, hook activation stayed absent in the writing process
and occurred after restart, and durable approval/effect/action evidence was
retained.

This is a bounded product-roadmap closure, not a release or integration verdict.
The draft stack remains unmerged. Cross-platform release, notarization,
publication, deployment, live-provider receipts, and universal action-gateway
mediation are not claimed.

## Before and after

| Boundary | Before | After |
| --- | --- | --- |
| Roadmap state | `TRUST-02` remained `building` even though its packaged local Done path had passed on the earlier stack. | `TRUST-02` is `shipped` with an exact-head closure receipt tied to the written card contract. |
| Current-head regression risk | The earlier receipt predated the Desktop project-switch and UX-03 commits. | The packaged proof was rerun from source head `590126e9…` and passed without tracked build drift. |
| Open build order | Dependents stayed behind a still-open `TRUST-02`. | `TRUST-02` leaves the open queue; `TRUST-04` and `TRUST-01` remain the next trust cards in dependency order. |
| Scope language | Release-only gaps were mixed into the reason not to close the bounded card. | The card closes on its written Done contract; release, live-account, protected-source, and universal-gateway claims remain separate gates. |

## Exact executed path

Command, from `vanta-ts/`:

```text
npm run desktop:trust-02:proof
```

Observed exit: `0`

Observed behavior:

- packaged and locally code-signed macOS app launched;
- nine missing-token, wrong-token, or hostile-origin requests denied;
- trusted renderer access passed;
- model-controlled hook denial and exact approval executed;
- synthetic `.env` and audit-state values produced zero exposure and zero mutation;
- four exact approval transitions persisted;
- same-process hook activation remained absent;
- one post-restart hook activation occurred;
- 21 tool transitions and eight action receipts were retained;
- all eight required tool receipts were present.

Package hashes:

| Artifact | SHA-256 |
| --- | --- |
| `Vanta.app` `app.asar` | `2ed12d9961a9ce82c887de8893b559ac797e58a40ff33354638587ed80bb5850` |
| Embedded kernel | `68c02be00eda10c27c98e0268b176cfc69589c3ca573f7885f7c9eb6dbe577ba` |

## Written Done contract mapping

| Card clause | Evidence | Grade |
| --- | --- | --- |
| Hook/control-plane, credential, audit-state, and unauthenticated Desktop/API attempts produce no unmediated effect or secret exposure. | Hostile API matrix plus packaged hook, file, shell, credential, and audit-state scenario; 9 denied, 0 secret exposure, 0 mutation. | Executed |
| Complete proposed payload is denied or exact-approved. | Denial path plus exact hook approval bound to the complete payload and SHA-256; four durable approval transitions. | Executed |
| Hook activation is restart-bounded. | No activation in the writing process; one activation after process restart. | Executed |
| Audit evidence remains outside agent scope. | Synthetic audit key and event state were denied to model-controlled file and shell paths and absent from receipts. | Executed |
| Exact-origin and adversarial shell, file, hook, Desktop, and restart paths run end to end with retained receipts. | Packaged proof executed all named paths; 21 tool transitions and eight action receipts retained. | Executed |

## Verification ledger

| Check | Result | What it does not establish |
| --- | --- | --- |
| Real packaged TRUST-02 proof | Exit `0`; exact observations above. | Another operating system, notarization, live external provider behavior, publication, or deployment. |
| Local code signature validation | `Vanta.app` valid on disk and satisfies its designated requirement. | Apple notarization or distribution acceptance. |
| Post-proof Git status and whitespace check | Clean; no tracked build drift and no whitespace errors. | The later closure-document diff by itself. |
| Protected-path comparison since the original implementation base | Root `src/**`, `vanta-ts/src/factory/**`, and `MANIFESTO.md` absent. | A future authorized protected-source migration. |

## Separate repository gate

`npm audit --omit=dev` still reports five high-severity transitive advisories:
`adm-zip` through `onnxruntime-node` and `@huggingface/transformers`, plus
`sharp`/libvips. Both dependency chains report no fix available. This closure
does not change dependencies and does not claim dependency-audit green or
release readiness. Replacement, reachability proof, or an upstream fix remains
a separate integration gate.

## Repository and authority boundaries

- No root `src/**`, protected factory source, or `MANIFESTO.md` change is part of
  this closure slice.
- No unrelated repository content, local state, checkout, or credential belongs
  in this payload.
- GitHub Actions remain disabled; no paid workflow is required.
- No live account, participant, outreach, billing, merge, release, publication,
  notarization, deployment, or direct push to `main` occurred.
- No checkpoint tag is created here. The operator's separate authorization
  record remains the gate for any new non-release tag.

## Next dependency-ordered work

`TRUST-04` is now the smallest ready trust card: prove one typed
WorkItem/Run/Approval/Receipt truth contract across representative file, UI,
message, calendar, job, and restart hosts. `TRUST-01` remains next in parallel
dependency terms but still needs the ordinary-tool gateway and Calendar/Drive
real-path guarantees. Neither card is promoted by this audit.

Machine-readable receipt:
`docs/trust-02-closure-receipt-2026-08-02.json`.
