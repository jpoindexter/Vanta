# Done-path flake measurement

Runs: 20. Runs where every step passed: 20/20. Crashed runs: 0.

| step | passed | what |
|---|---|---|
| a1 | 20/20 | chat in project A: live tool steps, then a card naming the exact action |
| b | 20/20 | Always allow runs the tool and saves a rule scoped to project A |
| c | 20/20 | quit every process, relaunch with the same userData and VANTA_HOME |
| d | 20/20 | new chat in project A, same tool call: no card, tool runs |
| g | 20/20 | edit_file on deploy-notes.md and production-plan.md does not ask |
| f | 20/20 | one-way command asks with no Always and a reason, even after Always for shell |
| e | 20/20 | project B (switched in the app) still asks; nothing saved for B |
| h1 | 20/20 | paste 200 KB: keystrokes stay under 250 ms, draft kept, message sent |
| h2 | 20/20 | paste an image: no freeze, draft kept |
| i1 | 20/20 | 1440x900: full sidebar, no horizontal overflow |
| i2 | 20/20 | 1100x800: 56px rail, no horizontal overflow |
| i3 | 20/20 | 800x700: sidebar is a drawer that opens and closes, no overflow |

Probes (recorded, never gate the verdict):

| probe | passed | what |
|---|---|---|
| a2 | 0/20 | card wording matches the tool (not 'Run a command' for an edit) |
| c2 | 0/20 | no process at all outlives quit (the kernel daemon is detached by design) |
| f2 | 19/20 | git push (irreversible) still asks after Always for shell commands |
| h3 | 0/20 | pasted image becomes an attachment on the message |

Failure messages:


Seconds per run: 41, 39, 39, 39, 39, 40, 39, 39, 39, 39, 39, 39, 39, 39, 39, 38, 40, 39, 38, 36
