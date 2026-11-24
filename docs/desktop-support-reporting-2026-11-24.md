# Private support reporting — 24 November 2026

Supporting slices: `DESKTOP-PRIVATE-FEEDBACK` and
`DESKTOP-CHAT-IMAGE-FAILURE-RECOVERY`. Owner: Jason. Source candidate only;
the public and installed Desktop 0.1.4 releases have not been replaced.

## Reported problem and reproduced boundaries

An external tester reported a PDF attachment failure. A supplied screenshot
also shows Open logs failing with `unsupported: logsRoot`. The tester's exact
app version, attachment origin and underlying PDF failure remain unknown.
Do not claim a minimized local case establishes that incident's cause.

Two source boundaries were reproduced:

- The native bridge advertised an unsupported profile-log reader. The error
  card called it instead of the already implemented native log-reveal action.
- A browser-origin PDF File without an OS path is rejected with a generic
  attachment warning. That missing ingestion capability remains open. This
  change captures its specific failure code and offers reviewed reporting;
  it does not pretend the PDF was attached or weaken filesystem guards.

## Smallest complete reporting extension

Read-only comparison of Brutal's actual diagnostic recorder, export/save flow
and support guide informed this work. No Brutal source, dependencies, service,
user state or dirty work were copied or changed.

Reuse the existing Vanta Help/About dialog, private receiver, draft persistence,
exact preview, report UUID and immutable same-ID retry. There is no second
reporting service, new payload schema, database migration or automatic upload.

- Native Open logs uses `revealLogs`. The unsupported optional `logsRoot`
  capability is absent; legacy gateways retain their real profile-log route.
  No remote-runtime log access is implied by opening local Desktop logs.
- Failure notifications and reply error cards offer the same Send feedback
  dialog. Reporting never retries the failed chat, tool or external action.
- A local ring holds at most 20 closed-vocabulary failure records: generated
  UUID, recording time, area and code. Unknown codes become `unclassified`;
  invalid areas are refused. No exception strings, paths, filenames, model
  prompts, conversation contents, credentials or raw logs enter this ring.
- Add diagnostic details explicitly inserts app/platform/runtime versions,
  an available validated commit and up to six records from the past seven
  days into the editable context. Nothing is included automatically. The
  shared receiver shape is unchanged; diagnostics use its existing steps field.
- The context's 3,000-character cap never overwrites reproduction steps to fit
  diagnostics. Pending reports stay locked and retain exactly the same ID and
  payload for an explicit retry. Editing or clearing local codes does not
  rewrite a previously prepared report or an already copied context.
- Copy report and Save report use the exact preview. Save produces local JSON;
  it is not a send. The form scrolls in short windows. All nine bundled
  languages include the new controls and disclosure.

Stored codes are capacity-bounded. Seven days is an export filter, not a
promise of timed disk erasure while Vanta is closed. Clearing saved codes is
explicit. If persistence fails, the current process retains new evidence in
memory; this does not establish crash persistence when storage is unavailable.
Manually entered report text can still contain private data: review it before
sending. This is not a universal redactor or a replacement for crash reporting.

## Executed evidence

- Before correction, two focused checks failed for the advertised log stub
  and the rendered error card's failure to call native reveal. They then passed.
- The final affected feedback/log/notification/composer group passed 78 checks, including
  content canaries, ring bounds, invalid metadata, failed-write memory fallback,
  context preservation, local export and immutable retry. Three receiver checks
  using real SQLite passed for duplicate races, uncertainty and trust boundaries.
- Renderer/Electron typechecks and the actual source build exited zero.
- Actual isolated Electron passed 11 assertions: real preload capability,
  native IPC targeting the isolated log, pathless PDF failure, report entry,
  reviewed code/steps, tested content exclusion, 600×650 control reachability,
  actual downloaded JSON equality, draft retention after renderer reload,
  zero feedback requests and zero renderer errors.
- The existing public receiver's health endpoint returned its expected response.
  No new report was submitted and no delivery/inbox claim was made.

The first native driver stopped at legitimate first-run setup; its correction
used the visible choose-later action. Another comparison needed filesystem
canonicalization. A later observer timed out waiting for Playwright's download
event although Electron had written a valid report. The final proof observes
the actual downloaded file. None justified changing app security or onboarding.

## Remaining acceptance and re-entry

Not established: the tester's incident cause, successful pathless/external PDF
ingestion, signed new-package delivery, real Finder/Save-panel presentation,
full keyboard/VoiceOver acceptance, crash restart, new support email or inbox
arrival. Native Finder and Save-dialog edges were substituted in the private
proof; the actual IPC and file download ran. Existing cards stay open.

Next: establish the affected tester version and attachment entry path, then
reproduce it with a synthetic equivalent. Separately qualify and package the
new candidate before advertising these additions to installed users. Preserve
the current app, profile, rollback and unknown-effect/no-replay fences. The
broader active Hermes MCP/cache/child-work reliability goal remains separate;
this reporting slice does not complete it.
