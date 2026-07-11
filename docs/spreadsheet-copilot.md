# Spreadsheet copilot

Vanta has a first-class local `.xlsx` workflow through the
`spreadsheet_workbook` tool and `vanta spreadsheet` command. It uses ExcelJS,
keeps paths inside the project, caps workbooks at 50 MiB and ranges at 10,000
cells, and never applies a workbook change before showing a preview.

```bash
vanta spreadsheet inspect reports/model.xlsx --sheet Summary --range A1:F20
vanta spreadsheet explain reports/model.xlsx --sheet Summary --cell B3
vanta spreadsheet preview reports/model.xlsx --plan changes.json
vanta spreadsheet apply reports/model.xlsx --plan changes.json --yes
vanta spreadsheet model examples/finance/dcf.json --out reports/dcf.xlsx --yes
```

A plan is bounded JSON:

```json
{
  "changes": [
    { "kind": "set", "sheet": "Summary", "cell": "B2", "value": 125 },
    { "kind": "formula", "sheet": "Summary", "cell": "B3", "formula": "B2*1.2" },
    { "kind": "add_sheet", "sheet": "Forecast" },
    {
      "kind": "chart",
      "sheet": "Summary",
      "chartType": "line",
      "title": "Revenue forecast",
      "titleCell": "H1",
      "sourceRange": "B3:F3",
      "from": "H2",
      "to": "P18"
    }
  ]
}
```

The agent tool accepts `inspect`, `explain`, `preview`, and `apply`. Formula
explanation names functions, references, and arithmetic without evaluating or
changing the workbook. `apply` includes the cell-level or chart preview in the
approval prompt. The CLI requires `--yes` after a separate preview. Both paths
write to a temporary workbook, reopen it, verify every requested
cell/formula/sheet/chart mutation, atomically replace the original, and write a
receipt under `.vanta/spreadsheet/receipts`.

Charts are bounded bar or line snapshots with 1-5 series and up to 50 points.
They are embedded PNGs, not native Excel chart objects, so rerun the plan after
source values change. Negative-value chart snapshots are currently rejected.

## Finance models

`finance_model` and `vanta spreadsheet model` generate five strict brief types:

- `three_statement`: linked income, cash flow, and balance rows with a balance check.
- `dcf`: unlevered cash flow, terminal value, value per share, and 5x5 WACC/growth sensitivity.
- `comps`: EV/revenue and EV/EBITDA medians with implied equity value.
- `lbo`: sources/uses, debt paydown, MOIC/IRR, and 5x5 exit/growth sensitivity.
- `merger`: stock/cash consideration, pro forma EPS, and accretion/dilution.

Generated workbooks contain assumptions, formula-driven model sheets, cached
results, and a `Checks` sheet. Vanta reopens the output, requires at least ten
formula cells and all checks to pass, then writes a mode-0600 receipt under
`.vanta/spreadsheet/finance-receipts`. The receipt stores hashes and check
results, not the full brief.

Current proof: the real CLI generated an 88-formula DCF, applied an embedded
revenue chart, reopened it, and produced receipts. LibreOffice independently
opened the workbook and rendered assumptions, five forecast years, 25
sensitivity values, the 640x360 chart, and passing checks without formula
errors.

## Excel sidecar

`SpreadsheetVantaClient` in the operator SDK sends bounded workbook context to
the token-authenticated public API and marks cell values as untrusted data. The
example custom function is under
`examples/spreadsheet-sidecar/excel-custom-functions.ts`.

Put an HTTPS proxy in front of loopback Vanta, create a revocable API token, and
allow only the add-in origin:

```bash
vanta api token create "Excel add-in"
export VANTA_PUBLIC_API_ALLOWED_ORIGINS="https://localhost:3000"
vanta api serve 7791
```

Store the proxied API URL and token in `OfficeRuntime.storage`, never workbook
cells. Exact HTTPS CORS preflight plus authenticated allowed/denied-origin
requests pass against a real Vanta HTTP server fixture. Spreadsheet requests
therefore enter the normal Vanta session and kernel-gated tool boundary; the
client does not write workbooks around `spreadsheet_workbook`.

Current boundary: the client, CORS, auth, and kernel path are implemented, but
the custom function has not run inside a real Excel host. Google Sheets host
integration is also not claimed.
