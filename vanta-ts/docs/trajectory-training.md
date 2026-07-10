# Trajectory training

Vanta can turn its local session history into compact tool-calling training data
and feed the existing local LoRA runner.

```sh
vanta trajectory export --tools-only --limit 100
vanta trajectory train ~/.vanta/training/trajectories-<timestamp>/lora-sft.jsonl \
  --base-model tiny-test --steps 4
```

Use a Hugging Face model id instead of `tiny-test` for a real base model. Set
`VANTA_LORA_PYTHON` when the ML dependencies live in a virtual environment.

## Artifacts

Each export directory is private (`0700`); files and generated adapter artifacts
are `0600`.

- `trajectories.jsonl`: `vanta.trajectory.v1` conversations with user,
  assistant tool-call, compressed tool-result, and final assistant messages.
- `lora-sft.jsonl`: one `prompt`/`chosen` row per assistant decision. Tool calls
  remain explicit `<tool_call>` records, so one trajectory can produce multiple
  training examples.
- `manifest.json`: batch counts and tool-result compression totals.

High-confidence and structural secret shapes are redacted before export. Tool
results first pass through Winnow; results still over 8,000 characters retain a
deterministic head/tail view plus the original SHA-256. The full source remains
in the referenced local session and is never copied into the compressed row.

`--tools-only` excludes plain chat turns. Without it, the batch includes every
complete user/assistant turn. Export is local-only and never uploads a dataset.
