# Provider setup proof, run 01 (2026-10-14)

Command (from `desktop-next`, after `npm run vanta:build`): `node tools/provider-proof/run.mjs --out docs/proofs/provider-setup/run-01`

What it drives: the real Electron shell and real Vanta runtime server (and Rust kernel) in a throwaway sandbox (own HOME, VANTA_HOME, user data, git project; kernel on a private port), launched with **no model provider configured**. The model side is two local stand-ins (`tools/provider-proof/fake-provider.mjs`): an OpenAI-compatible endpoint that accepts only the keys it was told to accept (the sandbox's `providers.json` points the app's own `groq` provider at it, so the app's real setup route verifies a key against it) and a fake Ollama whose model list can be switched off. Keys are fake strings, never real credentials.

Result: 8 of 8 steps pass (`result.json`, screenshots `*.png` in this folder).

| Step | What happened (from `result.json`) |
|---|---|
| a | First run: the provider picker is shown; the server answers `/api/status` with "OPENAI_API_KEY is not set..."; no `.env` exists. |
| b | Typed `http://localhost:11434` with the fake Ollama down: "Ollama is not answering at http://localhost:11434. Start it, then connect again."; no `.env` written. |
| c | Fake Ollama up: Connect works, the picker closes, `/api/status` says provider `ollama`, a chat is answered, the status bar stops saying "Backend needs setup". `.env` keys: VANTA_PROVIDER, VANTA_MODEL. |
| d | Settings > Providers > API keys, Groq row, fake key A typed and saved: `/api/status` provider `groq`; `GET /api/setup` says `keyConfigured: true` with no key value anywhere in the answer; `.env` mode 600 with a `GROQ_API_KEY` entry; the stand-in endpoint saw one verification call with key A (200). |
| e | A chat is answered with key A. |
| f | Key A revoked at the endpoint, a message sent: the chat shows "groq rejected your API key" with **Reconnect model** and Retry, not "Task stopped before completion". |
| g | Reconnect model, fake key B typed, Reconnect and resume: the endpoint saw `summarize the brief` with key A (401), then the same message with key B (200); the answer appears in the thread. |
| h | No key found in the page text, text inputs, localStorage, sessionStorage or the app's stdout/stderr; the only file under the sandbox holding a key is `project/alpha/.vanta/.env` (mode 600). |

Limits (what this does NOT establish): fake provider endpoint, not a real provider (a real provider's 401 body shape is covered only by the classifier's tests); source Electron (`vanta:build`), not the packaged app; macOS only; one run (no flake rate); the key necessarily sits in the renderer's memory while typed and in the Electron main process while forwarded (the proof scans files, storage, page text and process output, not process memory); a setup makes the connected provider the default, there is no "add without switching".

Bugs this run found and fixed: (1) a terminal error frame with no streamed text left the thread blank (`use-message-stream/index.ts`); (2) the status bar kept saying "Backend needs setup" after a connect (readiness is now re-asked, as at boot); (3) the first-run banner showed the server's terminal instruction ("Run `vanta setup`").
