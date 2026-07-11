---
id: spreadsheet-copilot
title: Spreadsheet copilot
sidebar_position: 11
---

# Spreadsheet copilot

Vanta can inspect `.xlsx` ranges, explain formulas, preview and apply bounded
cell/sheet changes, and embed verified bar or line chart snapshots.

```bash
vanta spreadsheet inspect reports/model.xlsx --sheet Summary --range A1:F20
vanta spreadsheet explain reports/model.xlsx --sheet Summary --cell B3
vanta spreadsheet apply reports/model.xlsx --plan changes.json --yes
vanta spreadsheet model examples/finance/dcf.json --out reports/dcf.xlsx --yes
```

The `finance_model` tool and `model` command generate formula-driven
three-statement, DCF, comps, LBO, and merger workbooks. DCF and LBO include 5x5
sensitivity tables. Every write is previewed or approved, written atomically,
reopened, checked, and recorded with SHA-256 evidence.

A real Vanta CLI run generated an 88-formula DCF and embedded a revenue chart;
LibreOffice independently opened and rendered the workbook with passing model
checks. The operator SDK now includes a bounded spreadsheet client, and the
public API enforces an exact HTTPS CORS allowlist for browser add-ins. A real
Excel or Google Sheets host round trip remains the external proof.

See the repository's [full spreadsheet guide](https://github.com/jpoindexter/Vanta/blob/main/docs/spreadsheet-copilot.md).
