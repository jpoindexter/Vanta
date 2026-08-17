# Apple Mail local audit

Vanta can audit the local Apple Mail index for job-application messages through its governed `apple_mail_audit` tool. This is a Vanta capability, not a separate script. It does not send mail, change Mail data, contact a provider, or upload message content.

## macOS permission

Apple protects `~/Library/Mail` with Full Disk Access. If the command reports `Operation not permitted` or asks for Full Disk Access:

1. Open **System Settings → Privacy & Security → Full Disk Access**.
2. Enable the application that launches the command: Terminal, iTerm, Codex, or Vanta.
3. Quit that application completely and reopen it. macOS does not apply the permission to an already-running process.
4. Ask Vanta to retry.

Grant only the application you use. You can revoke the permission after the audit.

## Use it in Vanta

Ask naturally:

- “Audit Apple Mail for job-application status signals since 2025-01-01.”
- “Count possible job-application messages in Apple Mail.”
- “Show me the matched Apple Mail application metadata.”

Vanta discovers the newest numeric Apple Mail database directory instead of assuming a version. It invokes `/usr/bin/sqlite3` with `-readonly`; no shell is involved and the query selects metadata only.

Default output contains aggregate counts only. When you explicitly ask to see matches, Vanta asks for fresh in-app approval before reading and returning up to 25 sender, subject, and Mail-summary records. Use a `YYYY-MM-DD` date in your request to change the lower bound.

## Privacy boundary

- No message body is queried.
- Sender, subject, and summary fields remain hidden unless you explicitly request them and approve Vanta's in-app prompt.
- Approved metadata is marked as untrusted external data and stripped of terminal control characters before it reaches the agent transcript.
- Errors do not print the database path or a traceback containing the home directory.
- The live audit remains blocked until macOS grants Full Disk Access to the app running Vanta; fixture tests cannot prove access to a real Mail account.
