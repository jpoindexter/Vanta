# Schema harness evaluation and ablation

**Roadmap:** `SCHEMA-HARNESS-EVAL-ABLATION`
**Implemented:** 2026-07-17

## Outcome

Vanta's existing deterministic evaluation path now supports matched generic-versus-Schema trials:

```bash
vanta eval schema path/to/config.json
```

Each configuration freezes the provider, model, allowed tools, budgets, fixtures, run count, and six harness variants. Every fixture runs in a fresh existing eval sandbox. The comparison changes only the harness instruction.

Required fixture classes:

- repo repair
- browser workflow
- operator task

Required variants:

- generic workflow
- full Schema workflow
- Schema without timeline backtest
- Schema without the controlled commit gate
- Schema without probe planning
- Schema without model search

## Evidence contract

Every trial records a unique session ID, deterministic check result, failure detail, tool calls, real actions, token usage, estimated cost, prediction accuracy coverage, recovery coverage, transfer coverage, and budget overruns. Reports aggregate success rate, mean, population variance, failures, recovery rate, and transfer rate per variant.

The live adapter fails closed when its provider, model, or effective tool list differs from the frozen configuration. A tool/action/cost budget overrun changes the trial to failed even when its output check passes.

Configurations and reports are written immutably under:

```text
.vanta/eval-runs/schema/<eval-id>/
  config.json
  report.json
```

A conflicting rewrite is rejected. The config SHA-256 in the report makes the pair replayable and tamper-evident.

## Release boundary

The harness never declares a release. It only marks evidence reviewable when all fixtures are held out and required measurements are present. Public or training fixtures, unpriced runs, missing prediction measurements, or skipped recovery/transfer exercises remain diagnostic and block reviewability.

The live Vanta agent currently measures provider/model identity, exact tool inventory, tool calls, successful mutating actions, token cost, and failure-then-success recovery. State-prediction accuracy and cross-task transfer remain explicit `null`/not-attempted values unless a specialized runner emits them. Vanta does not infer those measurements from task success.

## Verification

Executed:

```bash
npx vitest run src/eval/schema-ablation.test.ts src/cli/eval-schema-cmd.test.ts --maxWorkers=1
npm run typecheck
```

The focused proof runs 36 trials: 3 fixture classes x 2 fresh runs x 6 variants. It verifies fresh sandbox/session isolation, matched controls, all four ablations, budget failure, variance/cost reporting, public-fixture refusal, immutable evidence, CLI routing, and real-action classification.

This verifies the evaluation machinery and deterministic fixture behavior. It does not establish that Schema beats the generic harness on real provider work; that claim requires held-out live runs through the same command and explicit operator review of the frozen report.
