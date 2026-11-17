# DN-14 cutover plan (2026-10-22)

Owner said yes to the cutover on 2026-10-22. Card rule that still binds: nothing is deleted until each item is ported or explicitly dropped by the owner. So this plan switches the default and keeps the old renderer in place and reachable.

Done = bare `vanta desktop` opens the installed Vanta app; `vanta desktop --classic` (or `VANTA_DESKTOP_CLASSIC=1`) still serves the old renderer; scripts and the companion that pass arguments behave exactly as before; one live run proves it.

## Facts (checked today)

- The only installed Vanta app is `/Applications/Vanta.app`, the desktop-next build (id `studio.theft.vanta-next`, build 6). There is no separate old app to retire.
- `vanta` is the terminal CLI. `vanta-next` opens the app.
- The old desktop is what `vanta desktop [port] [--companion]` starts: the desktop server plus the old renderer opened in the browser (`cli/desktop-entry.ts`, `cli/ops-app.ts`).
- Data: no migration. The server is the source of truth (`~/.vanta` untouched); the renderer storage keys migrate on first launch (done on the owner's profile 2026-10-22).

## Steps

1. Switch the default (reversible, code): `chooseDesktopLaunch` in `vanta-ts/src/cli/desktop-next-launch.ts`. Bare `vanta desktop` with the app installed opens it. Any argument (port, `--companion`, `--no-open`), `--classic`, `VANTA_DESKTOP_CLASSIC=1`, or a missing app keeps today's behaviour. If opening the app fails, fall back to classic with a message.
2. Test it: unit tests for every branch, then one live run of `vanta desktop`.
3. Retire without deleting: mark the old renderer deprecated in the docs. No file under `vanta-ts/desktop-app` is removed.
4. Parity: list what is still unported and undecided, and ask the owner per item (drop, port, later). Deleting `desktop-app/dist` and the old Electron main waits on this list.
5. Docs: CUTOVER-PARITY update section, STATUS, Trello DN-14.

## Rollback

`vanta desktop --classic`, or set `VANTA_DESKTOP_CLASSIC=1`. The old renderer files are untouched. Build 5 and the app data are backed up in `~/Documents/GitHub/docs/Vanta-backups/`.

## Out of scope (parked)

Deleting the old renderer, duplicate approval code and dead styles (needs the parity list signed off). Google Workspace V-035/036 (owner OAuth decision).
