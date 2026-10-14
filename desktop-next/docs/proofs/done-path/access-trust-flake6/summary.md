# Done-path flake measurement

Runs: 6. Runs where every step passed: 6/6. Crashed runs: 0.

| step | passed | what |
|---|---|---|
| a1 | 6/6 | chat in project A: live tool steps, then a card naming the exact action |
| b | 6/6 | Always allow runs the tool and saves a rule scoped to project A |
| c | 6/6 | quit every process, relaunch with the same userData and VANTA_HOME |
| d | 6/6 | new chat in project A, same tool call: no card, tool runs |
| g | 6/6 | edit_file on deploy-notes.md and production-plan.md does not ask |
| p | 6/6 | composer chip: Plan makes the server refuse a write tool, survives a restart (V-018) |
| f | 6/6 | one-way command asks with no Always and a reason, even after Always for shell |
| e | 6/6 | project B (switched in the app) still asks; nothing saved for B |
| h1 | 6/6 | paste 200 KB: keystrokes stay under 250 ms, draft kept, message sent |
| h2 | 6/6 | paste an image: no freeze, draft kept |
| i1 | 6/6 | 1440x900: full sidebar, no horizontal overflow |
| i2 | 6/6 | 1100x800: 56px rail, no horizontal overflow |
| i3 | 6/6 | 800x700: sidebar is a drawer that opens and closes, no overflow |

Probes (recorded, never gate the verdict):

| probe | passed | what |
|---|---|---|
| a2 | 6/6 | card wording matches the tool (not 'Run a command' for an edit) |
| c2 | 6/6 | no process at all outlives quit (the kernel daemon is detached by design) |
| v022 | 6/6 | app page: microphone query granted, camera query not granted |
| f2 | 6/6 | git push (irreversible) still asks after Always for shell commands |
| h3 | 6/6 | pasted image becomes an attachment on the message |
| h4 | 6/6 | the model receives the pasted image (request body images[]) |
| h5 | 6/6 | the attachment chip is cleared after send |

Failure messages:


Seconds per run: 49, 48, 48, 48, 47, 48
