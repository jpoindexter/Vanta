from pathlib import Path
import csv,json,hashlib
root=Path(__file__).parent
names='''Chat/Code draft and attachment isolation
Reload restores current mode and draft
Plan is read-only and does not show an approval to execute
Exact one-use preview and durable queue
Execution and verification are distinct; receipt states sample limit
Stop preserves partial work and does not auto-resume
Full access cannot be silently selected
Offline input remains queued on reconnect
Diff review comment persists
Sample terminal never executes user commands
Profiles create and switch with distinct conversation drafts
Automation drafts persist without creating a live schedule
Worker ticket view retains evidence state
Budget view distinguishes estimated and unknown spend
Nine Vanta integration entries remain reachable
Saved run reuse prepares a draft rather than replaying effects
Preservation review includes all 296 feature IDs
Dark theme switches both readable text and background tokens
Model download preview transitions from queued to ready
Each Vanta feature has an explicit retained destination
Escape closes a native dialog
Outputs uses an interactive card grid
A document card opens its contextual preview
Canvas card switches among chart, table, and board
Memory correction persists in the sample editor
Skill enable and disable changes visible state
Skill install is a clear preview with no installation
Global search filters conversations
Conversation rename updates title and sidebar
Today capture creates a visible private sample draft
Support Off removes recommendations and repeated nudges
Compact window changes layout and Escape restores it
Concurrent sample tasks retain their own run state
Denying one sample action does not stop a different task
Plan card pointer expansion at desktop reference size
Card expansion survives a Chat/Code round trip
Queue reorder/edit and attachment removal
Sample voice and capture do not request device access
Pin toggles and branch creates a separate conversation
Archive retains conversation and library restores it
Profile search excludes other profiles and shortcuts retain selected profile
Profile clone retains conversations; selection resets permission to Plan
Synthetic profile import and metadata export download
Schedule pause, workflow cancellation, and missed-wake recovery are explicit
Worker pause requires checkpoint acknowledgement and worker creation stays a draft
Budget draft survives tab navigation without granting spend
Chat-to-Code handoff prepares scoped draft without starting execution
390px mobile mode switch, closeable rail, and navigation drawer
889px workbench closes with Escape and plan cards respond to keyboard
Output download produces a Markdown file
Opening a captured thought prepares that exact text as a new Chat draft
Copy output uses the selected brief rather than a different artifact'''.splitlines()
checks=[dict(id=f'P-{i:03}',criterion=n,result='executed; observed expected sample behavior',scope='Browser prototype only; does not establish native/runtime acceptance') for i,n in enumerate(names,1)]
views=[('Workers budgets',32,1440),('Workers',31,1440),('Tickets',30,1440),('Worker activity',30,1440),('Output card grid',34,1440),('Run library',31,1440),('Memory',31,1440),('Skill library',33,1440),('Customize',29,1440),('Today',38,1440),('Automations',33,1440),('Connections',36,1440),('Profiles',36,1440),('Settings',35,1440),('Code conversation',49,1440),('Browser preview',37,1440),('Files',43,1440),('Chat conversation',38,1440),('Code rail overlay',38,390),('Output cards',17,390),('Connections',19,390),('Profiles',19,390),('Rail overlay',56,889)]
report={'date':'2026-10-16','method':'Human-readable assertions recorded after CUA browser interaction; manually transcribed from the browser tool results. Not an unattended replay suite.','checks':checks,'screenSamples':[dict(screen=n,visibleControlCount=c,width=w,h1=1,horizontalPageOverflow=False,unnamedVisibleControls=[]) for n,c,w in views],'console':'No captured error/warning entries in the test tab at final log read.','candidateHashes':[{'file':str(p.relative_to(root)),'algorithm':'SHA-256','digest':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((root/'prototype').glob('*')) if p.is_file()]}
(root/'evidence/browser-verification.json').write_text(json.dumps(report,indent=2)+'\n')
with (root/'PROTOTYPE-CHECKS.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(checks[0]));w.writeheader();w.writerows(checks)
features=json.loads((root/'feature-inventory.json').read_text())
assert len(features)==296 and len({f['id'] for f in features})==296
with (root/'FEATURE-AUDIT.csv').open('w') as f:
 fields=['id','feature','category','proposed_destination','preservation_decision','review_evidence','native_behavior','required_acceptance'];w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
 for item in features:w.writerow(dict(id=item['id'],feature=item['feature'],category=item['category'],proposed_destination=item['proposed_destination'],preservation_decision=item['decision'],review_evidence='Inventory row reviewed and mapped; searchable prototype requirement card exists. Category-level interactions are separately recorded in PROTOTYPE-CHECKS.csv.',native_behavior='Not executed feature-by-feature in installed Vanta',required_acceptance='Run original and redesigned native journey against exact packaged candidate; include failure/restart/profile/permission paths applicable to this feature. Prior explicitly retired items require no resurrection.'))
# Per-handler evidence is deliberately conservative. A registered handler alone is not a passing interaction.
groups={
 '03 04 05 06 07 08 33 34':'run stop approval allow deny verify receipt network run-queue',
 '09 10 50 52':'save-comment terminal-command download copy-output',
 '11 41 42 43':'profiles profile-new profile-save profile-clone profile-import profile-export',
 '12 44':'automations new-automation automation-save schedule-toggle workflow-pause workflow-cancel missed automation-scope',
 '13 14 45 46':'workers worker-pause worker-checkpoint new-worker worker-save budget-save',
 '15':'connections',
 '16':'reuse',
 '17 20':'features',
 '19':'providers model-download model-download-start',
 '21':'close-dialog',
 '22 23 24':'output canvas canvas-chart canvas-table canvas-board',
 '25':'memory memory-save',
 '26 27':'skill-toggle skill-install skill-install-preview',
 '28':'search',
 '29 39 40':'session-menu session-rename session-rename-save session-pin session-branch session-archive',
 '30 31 51':'captured support-on',
 '32 48 49':'mini sidebar close-panel',
 '37 38':'attach attach-sample capture-preview attach-capture voice voice-sample wake-toggle',
 '47':'handoff handoff-confirm',
}
byhandler={}
for ids,handlers in groups.items():
 for name in handlers.split():byhandler[name]=', '.join('P-'+i.zfill(3) for i in ids.split())
audit=json.loads((root/'evidence/control-binding-audit.json').read_text())
with (root/'INTERACTION-AUDIT.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=['handler','structural_result','browser_group_evidence','limit']);w.writeheader()
 for name in audit['handlerNames']:
  w.writerow(dict(handler=name,structural_result='Registered authored handler; no unresolved literal action references in candidate',browser_group_evidence=byhandler.get(name,'Source-inspected only; this specific control was not independently exercised'),limit='Group evidence proves only the named sample journey. A setup/preview dialog is not a connected service or completed native action. Some legacy handlers are superseded or unused.'))
md='''# Prototype interaction and feature audit — 2026-10-16

This is a completed inventory review and browser-prototype check. **It is not a full native Vanta acceptance run.** The redesigned application has not been implemented, and Claude visual equivalence still needs owner review. No live model calls, account connection, microphone/screen capture, terminal execution, background scheduling, or provider readback was used to claim success.

## Coverage and evidence

- All **296 unique inventory IDs** reviewed and assigned a preservation decision and destination: 245 shell entries plus 51 Vanta entries. `FEATURE-PRESERVATION.csv` retains original rows; `FEATURE-AUDIT.csv` adds explicit native acceptance gaps. This is feature coverage, not 296 passing native tests.
- **52 browser journeys** exercised with observed expected sample behavior. `PROTOTYPE-CHECKS.csv` lists every criterion. `evidence/browser-verification.json` records the assertions, sampled screens and candidate file hashes. These are manually recorded CUA results, not a newly authored automated regression suite.
- **108 registered action handlers**, **104 distinct literal action references**, **zero unresolved literal actions** in the structural audit. `INTERACTION-AUDIT.csv` accounts for every handler and distinguishes browser group evidence from source-only inspection. This does not imply every handler was individually clicked or every old handler is reachable.
- **23 screen samples** at widths 1440, 889 and 390 CSS px: one main h1, no horizontal page overflow, and no empty visible control names under the bounded DOM check. All major desktop destinations were sampled; narrow samples cover conversation/rail, cards, connections and profiles. This is not WCAG conformance or a full screen-reader audit.
- `node --check prototype/app.js` and `node audit-controls.cjs` executed successfully. The final test-tab console read returned no captured warnings/errors.

## Corrections made during the check

1. Scoped search and shortcut destinations to the selected profile; profile preferences, captures, schedules, notes and memory now have independent sample state. Cloning copies conversations/preferences but clears run receipts, queues and authority. Switching starts in Plan.
2. Made sample run state and timers belong to each conversation; a denied/stopped task does not affect another. The run captures its starting permission preset instead of reading a later selection.
3. Retained independent Chat/Code drafts, attachments, selected sessions and panels. Added persistent expansion for context and inline plan cards.
4. Added card library previews, output-specific copy/download content, and capture-to-draft follow-through. New conversations have their own empty state.
5. Added mobile Chat/Code controls, a visible rail Close control below the desktop breakpoint, Escape dismissal, and navigation drawer dismissal on selection.
6. Retained archive/restore rather than deleting sample conversations. Provider setup, installs, downloads, workers and schedules clearly distinguish drafts/previews from real effects.

The earlier 889px rail covering a conversation card was an overlay/viewport condition, not proof of a broken native details element. The final pointer and keyboard disclosure checks used the actual current viewport.

## Remaining boundaries and implementation work

| Area | Proven in this review | Still required |
|---|---|---|
| Layout and cards | Measured 288px reference sidebar; implemented shared shell, card rail, output grid, inline cards; browser sampled | Owner comparison against Claude at matching size/state; full font/spacing/icon refinement; native window/traffic-light behavior |
| Chat and Code | Draft, attachment, session, panel, handoff and queue sample flows | Real history/streaming/tool events, engine dispatch, long content, cancellation/race/reconnect and migration proof |
| Profiles | Sample create/switch/clone, scoped conversations/search/preferences, synthetic import and metadata export | Real profile schema, import validation, encrypted credentials, project/connection binding, migration/rollback; sample export deliberately excludes actual conversation data |
| Approvals and runs | Exact-action sample preview, one-use UI, stop/deny, unverified vs verified sample receipt | Kernel mediation, stale preview invalidation, replay protection, effect/readback and restart proof. Browser localStorage is not a security boundary |
| Connections | Nine catalog entries and scope previews | Real authentication, test/configure/trust/revoke/status, provider errors and account/recipient binding |
| Voice/capture/local models | Synthetic text/attachment, wake toggle and download progress UI | macOS permissions, local model bytes, dictation/playback, wake listening/off, cancellation and actual device behavior |
| Workers/automations | Drafts, schedule pause, workflow cancel, acknowledged worker pause and budget display | Real host/time-zone/sleep/wake execution, budgets/quotas, external CLI prerequisites, durable checkpoints and provider cost receipts |
| Outputs/memory/skills | Card drill-in, copy/download, canvas presentations, sample correction, skill toggle/install preview | Real format rendering, rich artifact semantics, scoped memory lifecycle, source/version validation and native tool capability execution |
| Advanced shell | Layout/compact previews; source-preservation destinations for legacy affordances | Native splits/tabs/pane swapping, detached windows, hotkeys/tray/quick chat/API/LAN/updater/signing/notarization acceptance |
| Accessibility/performance | Names/headings/overflow sample checks, Escape and keyboard plan disclosure, light/dark token switching | VoiceOver, full tab/focus management (including narrow overlays), contrast measurements, zoom/reduced motion, IME, large histories and native performance |

No feature is retired by this audit. Three historical owner-approved retirements remain identified in the plan. Unsupported/parked backend features stay explicitly labelled; they must not be presented as functional merely because a prototype has a destination card.

## Reproduce the bounded checks

Serve this directory on localhost and use a separate test port/origin to avoid overwriting the owner's review state. Walk `PROTOTYPE-CHECKS.csv` using only synthetic data. Use the permission preset, context rail sample run, Profiles, More destinations and Outputs tabs. Verify each visible result before recording it. Reset only the test origin if needed. Then rerun the two Node checks above. Browser assertions require a human or browser-control harness; the CSV is not executable test code.

The local checkpoint includes pre-existing concurrent Vanta source work. It is a recoverable Git snapshot, not certification of that source tree, its removed tests, the installed package, or a production release.
'''
(root/'PROTOTYPE-VERIFICATION.md').write_text(md)
state=root/'STATE.md';s=state.read_text().replace('Now: reconcile installed app identity with source worktrees; inspect Claude package and workflows.','Now: plan, 296-ID preservation audit, and 52 browser sample checks recorded. Create the authorized local integration checkpoint and report native gaps.').replace('Next: synthesize architecture and feature mapping; build the isolated prototype; exercise its main flows.','Next: native application implementation only after owner review of the full plan.').replace('unchanged Vanta source status.','record source concurrency and do not edit application code; locally checkpoint current integration work as authorized.')
state.write_text(s)
