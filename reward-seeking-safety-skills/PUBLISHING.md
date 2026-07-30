# Publishing

The repository is prepared as `jpoindexter/reward-seeking-safety-skills` and
tagged locally as `v0.1.2`. Authenticate GitHub CLI before publishing:

```bash
gh auth login -h github.com
gh repo create jpoindexter/reward-seeking-safety-skills \
  --public \
  --source=. \
  --remote=origin \
  --push \
  --description "Agent skills and eval utilities for reward-seeking, grader-targeting, and oversight-dependent behavior."
git push origin v0.1.2
```

Apply the repository topics after the first push:

```bash
while IFS= read -r topic; do
  gh repo edit jpoindexter/reward-seeking-safety-skills --add-topic "$topic"
done < repository-topics.txt
```

Create the GitHub release:

```bash
gh release create v0.1.2 \
  --repo jpoindexter/reward-seeking-safety-skills \
  --title "Reward-Seeking Safety Skills v0.1.2" \
  --notes-file CHANGELOG.md
```

Install the skills and router for Codex and Claude Code:

```bash
./scripts/install.sh
```

Apply the merge-ready roadmap payload from a writable Vanta checkout:

```bash
node scripts/apply-vanta-roadmap.mjs \
  roadmap/vanta-cards.json \
  /path/to/Vanta/roadmap.json
```

The importer refuses duplicate card IDs and creates a timestamped backup. Run
Vanta's roadmap generation and validation commands before committing the
canonical roadmap and generated HTML.
