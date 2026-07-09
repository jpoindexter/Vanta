# Blind-Spot Audit: Vanta Activation Roadmap Sequence

Resolved target: the roadmap organization committed as `62cca3c2 Organize roadmap toward activation`, especially the `building`/`next`/`horizon` sequence in `roadmap.json`.

Frameworks applied: blind-premortem, blind-outside-view, blind-unknown-unknowns, blind-inversion, blind-consider-the-opposite, blind-red-team, blind-chestertons-fence, blind-falsification, blind-survivorship-bias, blind-calibration, blind-bias-blind-spot, blind-steelman, blind-dunning-kruger, blind-johari-window, blind-curse-of-knowledge, blind-ladder-of-inference - 6 findings, 5 same-model-repetition notes

## Findings (severity-ranked)

1. **The roadmap says activation is the goal, but it does not require a cold user to actually activate.** (via blind-falsification; convergent with blind-premortem and blind-calibration as same-model repetition, not corroboration)
   Evidence: `WHAT-CAN-I-DO-GALLERY` is now `building` and its note says the success metric is "a new user reaches one useful workflow in under 2 minutes." Its done criteria, however, require `/what-can-i-do`, an empty-state dashboard, 8 workflows, and 3 demo fixtures; none require a cold run by a user, a scripted first-run acceptance test, or a measured time-to-first-useful-action.
   Severity: high - expected damage is building a polished gallery that still leaves Jason asking "what can I do with it"; plausibility is high because the metric currently lives in notes rather than done criteria or tests.
   Mitigation: Add a blocking done criterion to `WHAT-CAN-I-DO-GALLERY`: a fresh workspace fixture or cold-user script must start Vanta, pick one workflow, execute it, and produce a useful result within 2 minutes or the card is not shipped.

2. **The two `Now` cards can ship independently without proving the first useful workflow survives the sandbox failure path.** (via blind-inversion; convergent with blind-red-team and blind-unknown-unknowns as same-model repetition, not corroboration)
   Evidence: `SANDBOX-SCOPE-WIZARD` is `building` and recovers wrong-root/background refusal errors. `WHAT-CAN-I-DO-GALLERY` is also `building`, but neither card's done criteria require one of the gallery workflows to intentionally hit a wrong-root or background-refusal fixture and recover inside the same user flow.
   Severity: high - expected damage is a user selecting a promising workflow and immediately landing in the same sandbox confusion that triggered the roadmap work; plausibility is medium-high because the two cards are adjacent but not contractually integrated.
   Mitigation: Add an explicit integration fixture: a gallery workflow starts from a repo outside scope or a background dev command, receives the scope wizard guidance, and resumes or clearly restarts with the correct command.

3. **The plan may optimize the board rather than the product path because dependency links are advisory only.** (via blind-chestertons-fence; convergent with blind-ladder-of-inference as same-model repetition, not corroboration)
   Evidence: `after` dependencies were added to cards like `CRASHLOG-DIAGNOSE`, `SPEC-TO-APP-WIZARD`, `AUTONOMY-CONTRACT-WALLS`, and `AUTO-WATCH`, but the existing roadmap renderer only displays cards by status/tier; the inspected roadmap code treats `after` as schema metadata and does not enforce dependency ordering or block a move.
   Severity: medium-high - expected damage is future roadmap moves bypassing the intended sequence; plausibility is medium because discipline may hold manually, but the tool will not enforce it.
   Mitigation: Add a roadmap check or move guard that warns or blocks moving a card to `building` while any open `after` dependency is not shipped.

4. **The `Next` lane still mixes showcase workflows, autonomy architecture, and memory infrastructure, so the next pull after Phase 1 may diffuse again.** (via blind-premortem; convergent with blind-outside-view as same-model repetition, not corroboration)
   Evidence: `Next` currently includes `CRASHLOG-DIAGNOSE`, `VANTA-BG-RESPOND-CONTINUE`, `SPEC-TO-APP-WIZARD`, `AUTONOMY-CONTRACT-WALLS`, `TRUST-LEDGER-AUTONOMY`, `STANDING-GOAL-SENTINEL`, `VAULT-COMPILE-PIPELINE`, and `RESEARCH-RECEIPTS-SKEPTIC`. That is a coherent ladder, but the lane does not name a release boundary such as "Activation v1" versus "Autonomy v1."
   Severity: medium - expected damage is parallel partially-done foundations instead of one user-visible upgrade; plausibility is medium because Vanta's roadmap already has a large horizon and history of many simultaneous tracks.
   Mitigation: Add release labels or phase notes to the cards: Activation v1 must ship `WHAT-CAN-I-DO-GALLERY`, `SANDBOX-SCOPE-WIZARD`, and one showcase workflow before autonomy or vault infrastructure can enter `building`.

5. **Several card titles and done criteria still speak in Vanta-internal language, which undercuts the discovery goal.** (via blind-curse-of-knowledge; convergent with blind-dunning-kruger as same-model repetition, not corroboration)
   Evidence: The organized cards use terms such as "trust ledger," "standing-goal sentinels," "vault compile pipeline," "`VANTA-RESEARCH-DECOMPOSE`," and "Hermes-level operator loops." These are meaningful to the roadmap author, but the target problem is that the user does not know what Vanta can do.
   Severity: medium - expected damage is that the roadmap becomes clearer to builders but not clearer to the user; plausibility is high because the wording is visible in the card titles and done criteria.
   Mitigation: For every activation-facing card, add a user-language subtitle or first workflow sentence: "Fix a pasted error," "Turn a long spec into an app," "Remember transcript lessons," "Watch this repo and wake me only when action is needed."

6. **The roadmap relies on the same authoring loop to decide what is useful; no outside feedback source is attached to the activation claim.** (via blind-johari-window; convergent with blind-bias-blind-spot and blind-survivorship-bias as same-model repetition, not corroboration)
   Evidence: The extraction note and roadmap cards are grounded in pasted transcripts, but the organized sequence does not include a feedback source from a non-author user, a fresh model with no context, analytics, or a recorded usability run. The blind quadrant is whether the workflow names and empty state actually land for someone who has not lived in the repo.
   Severity: medium - expected damage is confidently shipping an explanation that still fails newcomers; plausibility is medium-high because the current checks are schema/tests/typecheck, not reception/usefulness checks.
   Mitigation: Before shipping the gallery, run one fresh-context review or user walkthrough against the actual first screen and record the first point of confusion as a blocking fix.

## Residual (what this audit could not see)

- I did not inspect the rendered roadmap visually in a browser beyond confirming the generated HTML contains the expected cards.
- I did not run Vanta interactively as a cold user, so the activation-risk findings are based on roadmap criteria, not observed user failure.
- I did not inspect uncommitted future work; the audit only covers the current committed organization and the current `roadmap.json`.
- I did not use subagents because the available subagent tool requires an explicit user request for delegation; all framework passes came from the same model/context, so convergence is weak evidence unless independently spot-checked.
- Frameworks that returned no separate finding after dedupe: blind-consider-the-opposite, blind-steelman. Their useful counter-case was absorbed into the activation-first and "smallest real workflow" findings.
- Self-audit caveat: this audit graded its own evidence; nothing here was spot-checked by an outsider or a second model.
