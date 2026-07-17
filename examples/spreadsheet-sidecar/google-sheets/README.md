# Google Sheets Apps Script sidecar

`Code.gs` gives a real Google Sheet two bounded, read-only functions:

- `VANTA_ASK(prompt, values)` sends workbook context to one kernel-gated Vanta session.
- `VANTA_APPROVAL()` exposes the current fresh approval without resolving it.

Approval decisions are intentionally available only from the **Vanta** menu.
They cannot run as cell formulas because Sheets may recalculate formulas without
a fresh operator click.

## Install

1. Start `vanta api serve 7791` behind an authenticated HTTPS proxy.
2. Create a revocable token with `vanta api token create "Google Sheets proof"`.
3. Open a Google Sheet, choose **Extensions > Apps Script**, and add `Code.gs`.
4. In **Project Settings > Script Properties**, add `VANTA_API_BASE_URL` and `VANTA_API_TOKEN`.
5. Put `=VANTA_ASK("Summarize this range", A1:B5)` in a cell.
6. Reload the sheet. Use **Vanta > Ask about selection** for an explicit menu
   request, or use the review/approve/deny items when a Vanta action is waiting.

The token belongs in Script Properties, never a cell, formula, log, or committed
file. Revoke it after the proof. The API URL must be HTTPS. Values are capped at
32 KiB and wrapped as untrusted data before they enter the model context.

For an approval-gated workbook proof, use `VANTA_ASK` to request an exact
`spreadsheet_workbook` action, inspect the pending action from the Vanta menu,
and approve that exact ID from the menu. Keep the resulting local workbook
receipt and a screenshot or export of the Google Sheets result as external
acceptance evidence. Bound scripts are visible to spreadsheet editors, so use a
private proof sheet and revoke the API token immediately after the proof.
