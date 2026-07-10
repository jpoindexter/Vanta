# Native Windows

Vanta runs natively on Windows 11 without WSL. From PowerShell:

```powershell
git clone https://github.com/jpoindexter/Vanta.git
cd Vanta
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

The installer uses `winget` when Git for Windows, Node.js 22+, or Rust is
missing. It downloads a checksum-verified `x86_64-pc-windows-msvc` kernel when a
release asset exists, otherwise it builds the zero-dependency kernel locally.
The `vanta.cmd` launcher is installed under `%USERPROFILE%\.local\bin` and that
directory is added to the user `PATH`.

`shell_cmd`, background tasks, cron scripts, goal conditions, `!` shortcuts,
and build verification use Git Bash when it is installed. This preserves
Vanta's POSIX command dialect. If Git Bash cannot be located, they fall back to
noninteractive Windows PowerShell. Set `VANTA_SHELL` to `pwsh.exe`,
`powershell.exe`, `cmd.exe`, or a specific Bash path to override selection.

Windows has no built-in Vanta OS sandbox backend. Explicit `VANTA_SANDBOX=1`
therefore fails closed instead of silently running unsandboxed. Docker remains
available as the cross-platform isolation backend.
