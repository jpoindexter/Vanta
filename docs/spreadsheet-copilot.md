# Spreadsheet copilot

Vanta has a first-class local `.xlsx` workflow through the
`spreadsheet_workbook` tool and `vanta spreadsheet` command. It uses ExcelJS,
keeps paths inside the project, caps workbooks at 50 MiB and ranges at 10,000
cells, and never applies a workbook change before showing a preview.

```bash
vanta spreadsheet inspect reports/model.xlsx --sheet Summary --range A1:F20
vanta spreadsheet preview reports/model.xlsx --plan changes.json
vanta spreadsheet apply reports/model.xlsx --plan changes.json --yes
```

A plan is bounded JSON:

```json
{
  "changes": [
    { "kind": "set", "sheet": "Summary", "cell": "B2", "value": 125 },
    { "kind": "formula", "sheet": "Summary", "cell": "B3", "formula": "B2*1.2" },
    { "kind": "add_sheet", "sheet": "Forecast" }
  ]
}
```

The agent tool accepts `inspect`, `preview`, and `apply`. `apply` includes the
cell-level preview in the approval prompt. The CLI requires `--yes` after a
separate preview. Both paths write to a temporary workbook, reopen it, verify
every requested cell/formula/sheet mutation, atomically replace the original,
and write a receipt under `.vanta/spreadsheet/receipts`. Receipts record the
workbook, touched ranges, preview, timestamp, before/after SHA-256 hashes, and
verification result.

Current boundary: this slice edits values, formulas, and sheets. Embedded chart
authoring, formula evaluation, Google Sheets, and Excel custom functions are not
yet claimed. The sidecar should use the existing token-authenticated public API
(`vanta api serve`, then `POST /api/v1/input`) so spreadsheet requests enter the
same Vanta session and kernel-gated tool boundary; it must not write workbooks
directly around `spreadsheet_workbook`.
