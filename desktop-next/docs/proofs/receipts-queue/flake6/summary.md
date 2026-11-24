# Receipts and queue proof: repeated runs

Runs: 6. Runs where every step passed: 6/6. Crashed: 0.

| step | passed | what |
|---|---|---|
| a1 | 6/6 | forced failure shows the specific reason, the partial output and the saved actions; Retry the step recovers the run |
| a2 | 6/6 | Start from checkpoint puts the saved request in the message box; sending it recovers the run |
| a3 | 6/6 | Edit request opens the request for editing; sending it recovers the run |
| b1 | 6/6 | three messages queued behind a busy run appear in the panel and in the saved queue file |
| b2 | 6/6 | edit one queued message |
| b3 | 6/6 | reorder: move the last message one place earlier |
| b4 | 6/6 | cancel the first message |
| b5 | 6/6 | quit the app mid-run, relaunch, reopen the chat: the remaining queue is intact and not running |
| b6 | 6/6 | Run queue: the queued turns execute in the edited order and the queue empties |
| b7 | 6/6 | after another restart the chat shows both queued messages and their answers, in the edited order |

Failure messages:


Seconds per run: 26, 23, 23, 23, 24, 23
