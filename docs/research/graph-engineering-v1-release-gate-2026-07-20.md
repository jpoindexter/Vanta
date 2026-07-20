# Graph engineering v1 release gate

Date: 2026-07-20

## Executed criterion

From `vanta-ts/`:

```bash
npm run graph:v1:proof
```

The proof creates a fresh temporary project and runs the main workflow in two separate Node processes over one persisted run ID. The first process fails the independent reviewer after a confirmed builder write. The second process resumes the durable run.

## Observed receipt

```json
{
  "main": {
    "status": "succeeded",
    "writes": 2,
    "restarted": true,
    "parallelResearchers": 2,
    "builderAttempts": 2,
    "reviewerAttempts": 3,
    "approval": true,
    "acceptance": true
  },
  "adaptive": {
    "status": "succeeded",
    "change": "fan-out",
    "changes": 1
  },
  "failure": {
    "status": "exhausted",
    "escalated": true,
    "falseDone": false
  },
  "budget": {
    "tokens": 80,
    "costUsd": 0.07
  },
  "replay": {
    "events": 30,
    "handoffWritten": true
  }
}
```

## What this establishes

- Planner output fans into two parallel researchers and joins at one builder.
- Typed outputs from both researchers reach the builder only after both branches finish.
- A forced process restart does not replay the confirmed first builder effect.
- Rejected review findings return to the exact builder and artifact revision.
- Human approval and an executable file-content check are both required for success.
- Low confidence can add one predeclared researcher within the topology budget.
- Repeated rejection terminates exhausted and records escalation, never false done.
- The operator replay and text handoff are generated from durable receipts.

## Limits

This deterministic proof establishes Vanta's graph contracts and process-level durability. It does not establish provider availability, remote infrastructure reliability, or model quality outside the fixture inputs.
