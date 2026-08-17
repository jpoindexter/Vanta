# Apple Mail local audit

The Apple Mail audit scripts search the local Mail index for job-application messages. They do not send mail, change Mail data, contact a provider, or upload message content.

## macOS permission

Apple protects `~/Library/Mail` with Full Disk Access. If the command reports `Operation not permitted` or asks for Full Disk Access:

1. Open **System Settings → Privacy & Security → Full Disk Access**.
2. Enable the application that launches the command: Terminal, iTerm, Codex, or Vanta.
3. Quit that application completely and reopen it. macOS does not apply the permission to an already-running process.
4. Retry the command.

Grant only the application you use. You can revoke the permission after the audit.

## Commands

```bash
python3 scripts/audit-apple-mail-job-apps.py
python3 scripts/find-apple-mail-application-signals.py
```

The scripts discover the newest numeric Apple Mail database directory instead of assuming `V10`. They open SQLite with `mode=ro` and `query_only`, so writes fail closed.

Default output contains aggregate counts only. Printing sender addresses, subjects, and summaries is an explicit local action:

```bash
python3 scripts/audit-apple-mail-job-apps.py --details
python3 scripts/find-apple-mail-application-signals.py --details
```

Use `--since YYYY-MM-DD` to change the lower date bound. `--database PATH` supports a reviewed snapshot or test database without scanning `~/Library/Mail`.

## Privacy boundary

- No message body is queried.
- Sender, subject, and summary fields remain hidden unless `--details` is supplied.
- Errors do not print the database path or a traceback containing the home directory.
- The live audit remains blocked until macOS grants Full Disk Access; fixture tests cannot prove access to a real Mail account.
