# Drive the real app before calling an error card done

Date: 2026-10-14. Context: V-013 (provider auth reconnect) in desktop-next.

- Gateway unit tests, a card test and a real-server integration test were all green, and the real Electron run still
  showed a blank chat after a provider_auth stop: the thread drops a terminal error frame that has no text and no
  streamed bubble (`else if (finalText)` in use-message-stream). Every existing test sent a delta first.
- The same run also found a stale "Backend needs setup" chip and a terminal-instruction banner that no unit test could see.
- Rule: for any new failure state, add a test whose frame has no streamed text, and run the done-path style proof
  (`npm run vanta:providers`) before claiming the state works.
- Setup/provider changes: each chat keeps its own provider instance on the server; a setup must reach all of them
  (`setup-generation.ts`) and must carry history across, or "resume" silently runs on the old key or an empty chat.
