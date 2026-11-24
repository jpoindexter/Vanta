# A launch guard needs two placements: before the approval prompt and at the spawn itself

Context: MCP servers launched through package runners (`npx`, `uvx`) fetch code nobody reviewed. The guard had to refuse known-bad packages with no network call.

Approach that worked: one pure parser (`package-spec.ts`: command and args to registry packages) and one loader plus checker (`package-guard.ts`). The check runs at the top of each caller (mount, connect, the model-facing mount tool) so a denied package never reaches the trust prompt, and again inside `stdioTransport` as a backstop so a forgotten caller still cannot spawn it.

Gotcha found by reading, not by failing: `connect.ts` wrapped the transport step in `.catch(() => null)`, which would have turned a thrown refusal into "no command or url configured". The guard there returns the error view directly.

Check that proves it: delete the mount-side check and the test that asserts the trust prompt was never called fails, while the spawn backstop test still passes. Two placements, two tests.

Also: version-scoped entries cannot judge an unpinned launch offline, so the answer is to say "unpinned" on the prompt rather than guess.
