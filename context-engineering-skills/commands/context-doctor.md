---
description: Audit loaded agent instructions and propose a safe context cleanup
argument-hint: [optional path or audit focus]
---

Use the `context-doctor` skill on `$ARGUMENTS` or the current repository.

Remain read-only through the audit. Show the context budget, conflicts,
duplicates, retained gotchas, and a proposed cleanup diff. Do not edit files or
change permissions until the user separately approves the exact cleanup.
