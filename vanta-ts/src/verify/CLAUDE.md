# CLAUDE.md — verify

`check.ts` and `store.ts` back regression locks (`verify.jsonl`). `completion-verifier.ts` checks completion claims after a turn when `VANTA_VERIFY=1`. `visual-closeout.ts` powers `/verify` by turning changed files into required evidence: tests/types for non-doc work, command/tool observation for runtime code, and screenshot evidence for UI changes.

Conventions:
- One short provider call, timeout-bound with `AbortSignal`.
- Return `{ verdict, evidence }`; lifecycle code decides whether to append notes to the conversation.
- Passing results should be logged only; failing results become a system message for the next turn.
