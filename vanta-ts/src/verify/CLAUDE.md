# CLAUDE.md — verify

`check.ts` and `store.ts` back regression locks (`verify.jsonl`). `completion-verifier.ts` checks completion claims after a turn when `VANTA_VERIFY=1`.

Conventions:
- One short provider call, timeout-bound with `AbortSignal`.
- Return `{ verdict, evidence }`; lifecycle code decides whether to append notes to the conversation.
- Passing results should be logged only; failing results become a system message for the next turn.
