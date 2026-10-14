# Startup failures reproduced under load (2026-10-14)

Setup: `node tools/done-path/flake.mjs --runs 20 --keep` with a second Electron proof loop and six CPU burners running at the same time (load average 10 to 38). Runs below used the source runtime (tsx), not the packaged bundle.

- `run07-port-race/`: all of a1,b,c,d,g failed (95 s), the original DN-21 signature. `runtime.log` shows `Error: listen EADDRINUSE ... 127.0.0.1:7790` and exit code 1 right after start: another launch took the port between the free-port probe and the bind. Fixed in `0b7517ef` (retry on the next port); tested with a real runtime, with a negative control.
- `run12-switch-stale-project/`: step e failed after waiting 60 s for the project switch: status bar "Backend ready", project still `alpha`, while `runtime.log` shows the runtime for the new project started 0.2 s after the old one stopped and stayed up for 74 s. Not the port race. Open: DN-25.
