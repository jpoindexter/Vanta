# When a vendored UI keeps its own list, merge the server list in front instead of replacing the engine

Context: the Hermes composer queue is a window-local list with its own drain, edit, park and retry logic (about 600 lines). The server already had a durable, revision-checked queue.

Approach that worked: keep the local engine for what the server cannot carry (attachments), add the server entries as a second source in front (`entry.remote` carries revision and status), route each gesture by the entry's origin, and delete nothing. New behaviour lives in new files (feed hook, command hooks, ops, model); the vendored hook gained one optional argument.

Why it mattered: replacing the engine would have broken 600 lines of tests that pin behaviour nobody asked to change, and the size gate treats a vendored file you rewrite as yours.

Check that proves it: the real-app script reads the queue file on disk after every UI gesture, so the UI and the saved list cannot drift apart without a step failing.
