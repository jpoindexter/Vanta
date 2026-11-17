# Vanta Desktop cold-operator test packet — 2026-08-29

## Purpose and boundary

Observe whether one voluntary adult who is unfamiliar with Vanta can complete one
useful local task in the exact packaged candidate without repository knowledge or
facilitator coaching. This is one usability run, not representative market proof.

Participation is voluntary and uncompensated. Do not collect credentials, private
messages, health information, financial data, or other sensitive account content.
The participant may pause or stop at any time. No paid recruiting, research
platform, hosted CI, outreach automation, or new service is authorized.

## Candidate

- Branch: `codex/hermes-beta-integration-20260829`.
- Product-source commit: `e758160ca97b7d16bcaf01679712370cbbdae388`.
- Application: `vanta-ts/release/mac-arm64/Vanta.app`.
- Main executable SHA-256:
  `fc6fa00534695add66ea5d80b83f15b4b0e9a8a68c5d5b17815f7a0147ac00aa`.
- `app.asar` SHA-256:
  `162a07d5efa8ae6f1632a403e16663a9a62ce89e18c138c04118e0f47e5e9cc5`.

If any packaged source changes, rebuild and replace these hashes before the run.

## Consent script

> We are testing Vanta, not you. This is an unpaid, voluntary usability check.
> Please use only a disposable local task and no sensitive account data. You may
> stop, pause, or ask for accessibility support at any time. I will observe and
> take notes about the interface, not about you. Is it okay to continue?

Record only `consent: yes` or stop. Do not record a name, email, account identifier,
or screen content unrelated to the test.

## Facilitator rules

- Do not explain Vanta, its repository, navigation, model/runtime terms, or intended
  hierarchy before the task.
- Do not point, click, type, select a model, approve an action, or recover an error
  for the participant.
- Accessibility support requested by the participant is allowed and must be noted.
- If the participant asks what to do, reply once: “Use what is visible in the app;
  say what you expected to happen.” Record the request as a confusion point.
- Stop immediately on sensitive data, distress, an unsafe action, or a request to
  stop. Do not waive a blocking defect during the session.

## Task

1. Launch the exact packaged application from Finder.
2. Ask: “What do you think this app is ready for, and what controls what it can do?”
3. Ask the participant to choose a small disposable local task in their own words,
   such as creating a short text note in a temporary folder.
4. Observe whether they can identify the active model and access boundary, start
   the task, handle one approval or deliberately induced recoverable failure, and
   find the resulting output.
5. Ask: “What happened, where is the result, and what would you do next?”

Do not use live social, email, calendar, payment, messaging, or other external
accounts for this run.

## Observation record

| Field | Observation |
| --- | --- |
| Candidate executable and `app.asar` hashes match | pending |
| Consent | pending |
| Participant unfamiliar with Vanta and not a Vanta developer | pending |
| Start time / first useful result | pending |
| Identified current outcome | pending |
| Identified next action | pending |
| Identified model and access boundary | pending |
| Started one task in their own words | pending |
| Approval or recoverable failure handled | pending |
| Finished artifact found | pending |
| Assistance requested | pending |
| Confusion points, in order | pending |
| Accessibility support requested | pending |
| Stop condition encountered | pending |
| Participant explanation of what happened | pending |

## Acceptance rule

Pass only when every required behavior is directly observed without coaching beyond
the in-product UI. A failed or ambiguous run keeps both Desktop beta cards open.
Fix a blocking product defect on a new scoped commit, rebuild the exact candidate,
and repeat with an unfamiliar participant. Never rewrite the observation to convert
a coached or simulated run into a pass.

## Receipt boundary

Store the completed observation locally outside Git unless the participant has
explicitly approved a fully de-identified summary. Repository evidence may contain
only candidate hashes, aggregate timing, interface confusion points, product fixes,
and the pass/fail decision. It must not contain the participant's identity, voice,
face, desktop content, credentials, or account data.
