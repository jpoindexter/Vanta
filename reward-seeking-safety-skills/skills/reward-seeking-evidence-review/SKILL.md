---
name: reward-seeking-evidence-review
description: Review evidence and calibrate claims about reward-seeking, reward hacking, grader targeting, evaluation gaming, or oversight-dependent behavior. Use before saying a model is safe, aligned, deceptive, reward-seeking, or improved; also use to distinguish executed behavior, code-path evidence, assumptions, and inconclusive null results.
---

# Reward-Seeking Evidence Review

Build a claim ledger:

| Claim | Distribution | Evidence | Status | Does not establish |
| --- | --- | --- | --- | --- |

Tag status as `executed`, `code_path`, `inferred`, or `assumed`. A passing unit
test for an evaluator proves evaluator plumbing, not model behavior. A behavioral
shift proves sensitivity in that condition, not a stable global objective.

Check:

- model/provider/version and harness version are pinned;
- task distribution, authority pair, prompt channel, tool policy, and date exist;
- positive and negative controls worked;
- feature opportunity, invalids, refusals, and uncertainty are reported;
- final actions and receipts support the claim independently of chain-of-thought;
- a null is not caused by failed activation or low power;
- the result replicated on a changed surface form;
- an independent decision-maker, not the evaluated grader alone, owns release.

Rank the strongest defensible claim first. Downgrade overbroad language and state
the exact next experiment needed to close each gap.
