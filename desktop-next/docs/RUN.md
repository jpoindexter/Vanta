# Run the Vanta desktop

1. Prerequisites: Node 22+, `desktop-next` dependencies installed (`npm install` in `desktop-next`), the Electron binary downloaded, and a Vanta kernel binary at `<repo>/target/debug/vanta-kernel` (`cargo build` in the repo root).
2. Command, from `desktop-next`: `npm run vanta:app` (it builds the renderer and the Electron main first when `apps/desktop/dist` is missing; `--rebuild` forces it, `--hidden` keeps the window off screen).
3. It opens the real shell with the real Vanta server in a sandbox: its own `VANTA_HOME`, `HOME`, Electron user data and a throwaway git project (`acme-site`). Nothing under `~/.vanta` or the installed apps is touched.
4. Chats are answered by a canned local model (`vanta-proof`), so you see messages without a key. Closing the window deletes the sandbox.
5. You land on Home. Left: SESSIONS | BOTS tabs, New session, Home, Skills & tools, Connections, Outputs, Schedules, search, Pinned, Sessions, Cron jobs, then the profile row (home, +, import, ...) and the settings gear. Top right: Changes, Terminal, Browser, Files, then settings, layout editor, HUD, swap sides, right sidebar and More. Bottom: the status bar.
6. Known inert (present, backend or native call not wired): HUD, git review and commit, interactive terminal, file tree reads, Export, Branch, Move to project, profile create/import/edit, New project, worktrees, context meter, updates.
7. Proofs: `npm run vanta:reach` writes `docs/proofs/reachability-<date>.md`; `npm run vanta:shots` writes `docs/proofs/restore/*.png`.
