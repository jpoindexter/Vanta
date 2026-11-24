# AI delegation, adapted for Vanta (2026-10-22)

Source: the pasted video transcript (playbook, toolbox, proof, fix the playbook not the chat). The video's claim that Anthropic engineers stopped building agents is unverified and does not matter here. The method stands on its own.

## Verdict

Works for Vanta, and most of it already exists. Only three small pieces are missing. No new infrastructure.

| Video step | Vanta already has | Missing |
|---|---|---|
| Playbook (one job, one SOP) | Skills store: `vanta-ts/src/skills/` (distill, auto-improve, curator, eval corpus in `skill-eval/`) | The interview that writes the skill. Skill files have no mandatory Proof section. |
| Toolbox (signed-off assets reused) | Skill file assets (`skills/file-assets.ts`, not read yet), Outputs and Runs library in the app | A rule in the skill: check the toolbox before generating. An "approved" flag on an asset. |
| Proof (done checklist, self-review) | Verified-Done rules (vd-*), approvals, receipts | A required "Proof of Done" block per skill that the agent must pass before replying. |
| Fix the playbook, not the chat | `skills/auto-improve.ts` | Wire a failure to "edit this skill", not "tell the agent again". |

Name collision: Vanta's existing `playbook` tool (`tools/playbook.ts`, `playbook.jsonl`) is cross-session experiential memory (record, recall strategies). It is not the video's SOP. In Vanta, call the video's playbook a **skill**. Keep `playbook` for recalled strategies.

## The three prompts, rewritten for Vanta

Run each in a Vanta chat inside the project the job belongs to.

### 1. Interview, then write the skill

```
You are going to take over one recurring job of mine: [JOB, e.g. "weekly competitor pricing brief"].
Interview me before writing anything. One question at a time, max 12. Cover: inputs and where they live,
the steps I take, how I decide between options, edge cases, formatting and tone, what "done" looks like,
and what I always fix by hand afterwards. Stop when you could do the job without asking me anything.
Then write a Vanta skill named [kebab-name] with these sections, in this order:
Purpose, Inputs, Steps, Decisions and edge cases, Format, Toolbox, Proof of Done.
Leave Toolbox and Proof of Done as headings with "(next)" until I ask. Show me the skill before saving.
Save it with the skills tool only after I say yes.
```

### 2. Toolbox rule

```
Open the skill [kebab-name]. Fill its Toolbox section:
1. Rule: before generating any script, template, or document for this job, search the skill's own files
   and (with glob_files) the project for an approved one. Reuse it. Say which you reused.
2. Rule: when I approve a new script, template, or document from this job, save it as a skill asset
   with a one-line description and the date, and list it in the Toolbox section.
3. Never overwrite an approved asset. Propose a new version and wait for my yes.
List the assets that already exist for this job now. Do not invent any.
```

### 3. Proof of Done

```
Open the skill [kebab-name]. Fill its Proof of Done section with 5 to 8 checks I could verify
by looking at the output: concrete, pass or fail, no adjectives like "good". Each check names the
evidence (a file path, a number that matches its source, a section that exists).
Add this rule: before replying, run every check against the real output, fix failures yourself,
and run the checks again. In the reply, list each check with pass or fail. If a check cannot be
verified, say that instead of passing it. Do not call the job done while any check is failing or unverified.
```

### 4. When it goes wrong

```
The last run of [kebab-name] failed on: [WHAT WAS WRONG].
Do not fix this output yet. First tell me which section of the skill let this happen,
or which check was missing. Propose the smallest edit to the skill. After I approve and you save it,
redo the run and show the Proof of Done result.
```

## Trial (one evening, one job)

Done = the same real job runs twice from its skill; the second run reuses a saved asset and passes every Proof check with no manual fix from me.

Pick one recurring job that already hurts (candidate: the weekly competitor brief). Run prompts 1 to 3, then run the job. If run two needs a manual fix, use prompt 4 once. If it still needs hand fixes after that, the method does not fit that job: stop and note it in ERRORS.md.

## Built (2026-10-22)

- Bundled skill `vanta-ts/skills-library/own-a-job/SKILL.md` folds all four prompts into one skill: interview, write the job as a skill, toolbox, Proof of Done, fix-the-skill loop. One skill, not four (rule of 3).
- It uses the real tools: `skill_manage` (`create`, `write_file` for toolbox assets, `patch` for fixes) and `clarify` for the interview.
- Checked: the skill is discovered with the other bundled skills, and the skill library, frontmatter and agentskills-format tests pass (35).

## Resolved from the earlier open questions

- Approved flag: not needed. `skill_manage` stages agent writes for operator approval, so the owner approving the staged write is the sign-off. Assets are supporting files (`write_file`).
- Writing a skill from chat asks first, as the prompts assume.

## Still not checked

- Never run on a real job. The skill and prompts are written and discovered, not tested in a live turn. That needs a model, which is the open provider decision.
- Outputs: there is no agent tool that lists the app's Outputs; they are just files the agent wrote. The skill's reuse rule now uses the skill's own files plus `glob_files` over the project instead (checked in code, 2026-10-22).
