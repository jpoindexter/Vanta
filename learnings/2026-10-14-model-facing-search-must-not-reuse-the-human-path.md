# A search that feeds the model's prompt needs its own scope, redaction and kernel subject, not the human search wrapped

Date: 2026-10-14 · Area: tools / session history

The human `/sessions search` returns unredacted 100-char heads of the first matching message in recency order, across every
project in the home. Wrapping it as a tool would have put stored secrets and other-project text into the prompt.

## Pattern

1. Reuse the ranker and the store, rebuild the edges: scope filter, redaction, snippet, size cap. Redact the whole message
   first and cut the window second, so a secret cannot be half-shown at the window edge.
2. Read the writers before choosing a scope rule. Only the desktop records `cwd`, and `projectId` is almost never written, so a
   strict project filter would have returned nothing for REPL sessions. Filter out sessions KNOWN to be foreign, keep unknowns.
3. Keep the query out of the string the kernel sees. The denylist reads that string as a command, so a search for "git push
   --force" would be treated as the command.
4. A ranker that scores only the head of each message ranks long messages by text that does not contain the match. Hand it the
   matched region, not the head.
5. A loopback endpoint is classed as a local model and gets the small coding toolset; a smoke that needs another tool must set
   `VANTA_LOCAL_FULL_TOOLS=1` or the tool is never offered and the model silently answers without it.
6. Two hits per session, not one: the question and its answer are adjacent turns, and the question alone outranks the answer.
