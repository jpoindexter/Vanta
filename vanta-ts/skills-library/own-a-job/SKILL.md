---
name: own-a-job
description: "Take over one recurring job from the owner: interview them, write the job as its own skill, add a toolbox of signed-off assets, add a Proof of Done checklist, and fix the skill (not the chat) when a run goes wrong."
created: 2026-10-22
updated: 2026-10-22
tags: [delegation, skills, playbook, toolbox, proof-of-done, recurring-jobs]
---

# Own a job

One agent, one skill per job. When the owner hands over a recurring job ("take over the weekly competitor brief"), do not improvise each time and do not make a new agent. Write the job down once as a skill, then run the skill.

Not the same as the `playbook` tool: that records strategies that worked across sessions. This writes one job's full procedure.

## When to use

- The owner names a job they do repeatedly and wants it off their plate.
- A job keeps needing the same hand fixes after you run it.
- A run failed and the owner would otherwise correct you in chat.

Not for one-off tasks. A job that happens once does not get a skill.

## 1. Interview first

Ask one question at a time, 12 at most (`clarify` when a choice list fits). Cover:
- inputs and where they live
- the steps, in the owner's order
- how they choose between options
- edge cases they have hit
- format and tone of the result
- what "done" looks like
- what they always fix by hand afterwards

Stop when you could do the job without asking again. Write nothing until then.

## 2. Write the job as a skill

Show the draft in chat first. After the owner says yes, save it with `skill_manage` action `create`. Agent writes may be staged for operator approval; say so and wait.

Sections, in this order:
1. Purpose: one sentence.
2. Inputs: what, where, how to get them.
3. Steps: numbered, one action each.
4. Decisions and edge cases: if X then Y.
5. Format: the exact shape of the result.
6. Toolbox: filled in step 3.
7. Proof of Done: filled in step 4.

## 3. Toolbox

Signed-off scripts, templates and documents live inside the job's skill folder as supporting files (`skill_manage` action `write_file`). The owner approving the staged write is the sign-off.

Rules written into the job skill:
- Before generating a script, template or document, list the skill's own files, then search the project with `glob_files` for earlier results of this job. Reuse an approved one and say which.
- When the owner approves a new one, save it as a supporting file and add one line to the Toolbox section: file, what it is, date.
- Never overwrite an approved file. Propose a new version beside it and wait.
- List only files that exist. Do not invent assets.

## 4. Proof of Done

Write 5 to 8 checks the owner could verify by looking at the output. Each is pass or fail and names its evidence: a file path, a number that matches its source, a section that exists. No adjectives such as "good" or "clear".

Rule written into the job skill: before replying, run every check against the real output, fix failures yourself, run the checks again, and list each check with pass, fail or could-not-verify. Never call the job done while any check fails or is unverified.

## 5. When a run goes wrong

Do not patch the output in chat. First say which section of the skill allowed the failure, or which check was missing. Propose the smallest edit and apply it with `skill_manage` action `patch`, after approval. Then redo the run and show the Proof of Done result.

Two edits to the same skill for the same failure and it still fails: stop, tell the owner this job may not fit a skill, and offer options.

## Done for this skill

Done = the job ran twice from its skill, the second run reused a saved asset, and every Proof of Done check passed with no manual fix.
