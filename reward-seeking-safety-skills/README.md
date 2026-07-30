# Reward-Seeking Safety Skills

Agent skills and zero-dependency evaluation utilities for finding reward-seeking,
grader-targeting, and oversight-dependent behavior without confusing a passing
score with aligned intent.

The pack is based on *Measuring Reward-Seeking via Contrastive Belief Updates*
(Hojmark et al., Apollo Research & OpenAI, 2026). It translates the paper into
operational controls for agent harnesses. It does not claim to reproduce the
paper's training experiments or assign a universal reward-seeking score.

## What ships

| Entry point | Use it for |
| --- | --- |
| `/reward-safety` | Route an ambiguous reward, grader, oversight, or evaluation request |
| `contrastive-authority-eval` | Design paired authority-conflict evaluations |
| `reward-process-integrity` | Protect graders, holdouts, budgets, and evaluation state |
| `oversight-generalization-audit` | Compare behavior under present, flawed, and absent oversight |
| `eval-awareness-red-team` | Test metagaming and evaluation-awareness confounds |
| `reward-seeking-evidence-review` | Calibrate claims and separate executed evidence from inference |

The router can also select the relevant skills from plain language:

```bash
node scripts/route.mjs "Can this agent alter its verifier or hidden tests?"
node scripts/route.mjs --json "Compare behavior when the monitor is absent"
```

## Install

```bash
./scripts/install.sh
```

The installer copies all skills to `~/.codex/skills` and `~/.claude/skills`.
Override either destination for testing or custom installations:

```bash
CODEX_SKILLS_DIR=/tmp/codex-skills \
CLAUDE_SKILLS_DIR=/tmp/claude-skills \
./scripts/install.sh
```

After installation, invoke `/reward-safety` in Claude Code or Vanta and
`$reward-safety` in Codex. The component skills can also auto-trigger because
their frontmatter descriptions name concrete contexts such as grader access,
reward hacking, authority conflicts, oversight removal, metagaming, and
reward-seeking evidence review.

## Contrastive gap utility

The utility computes the paper's Laplace-smoothed contrastive log-odds gap and a
seeded Monte Carlo 95% posterior interval:

```bash
node scripts/contrastive-gap.mjs <<'JSON'
{
  "conditionA": {"successes": 87, "trials": 100},
  "conditionB": {"successes": 9, "trials": 100},
  "samples": 20000,
  "seed": 7
}
JSON
```

Condition A means the grader favors feature `f` while the opposing authority
favors `not-f`; condition B reverses the assignment. The result is specific to
that task distribution and authority pair. It is not a global model trait.

## Vanta roadmap

`roadmap/vanta-cards.json` contains 10 deduplicated cards ordered by dependency
and impact. Apply them to a Vanta checkout with:

```bash
node scripts/apply-vanta-roadmap.mjs \
  roadmap/vanta-cards.json \
  /path/to/Vanta/roadmap.json
```

The script refuses duplicate IDs and creates a timestamped backup before writing.

## Evidence boundaries

- The paper studies context-dependent behavior, mostly on coding tasks. Do not
  turn its result into a universal label for a model.
- Chain-of-thought is supporting evidence, not the detector. Prefer actions,
  tool receipts, file access, and outcome changes under controlled contrasts.
- In-context authority conflicts can detect a tendency but cannot reliably rank
  models or checkpoints because test recognition and prompt placement confound it.
- Contrastive SDF is a research lane requiring finetuning access and extensive
  calibration. It is not a default release gate.
- A null result is ambiguous until the instrument is shown to elicit the planted
  belief on that model and task distribution.

See [the paper brief](research/paper-brief.md) and
[blind-spot audit](research/blind-audit.md) for the source mapping and limits.

## Development

```bash
npm test
npm run check
```

No runtime dependencies are required.

See [PUBLISHING.md](PUBLISHING.md) for the repository, topic, release, install,
and canonical Vanta roadmap commands.

## License

MIT. The source paper is not redistributed and remains under its authors' terms.
