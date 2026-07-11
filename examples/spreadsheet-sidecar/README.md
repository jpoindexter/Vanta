# Excel custom-function sidecar

`excel-custom-functions.ts` is the host-side function template for the Vanta
Operator SDK. It reads `VANTA_API_BASE_URL` and `VANTA_API_TOKEN` from
`OfficeRuntime.storage`; do not put either value in workbook cells.

1. Create a revocable token with `vanta api token create "Excel add-in"`.
2. Put an authenticated HTTPS proxy in front of loopback `vanta api serve 7791`.
3. Set `VANTA_PUBLIC_API_ALLOWED_ORIGINS` to the exact HTTPS add-in origin.
4. Add `@jpoindexter/vanta-operator-sdk` to the Office add-in project.
5. Register the exported `ask` function in the add-in custom-functions metadata.

The template is transport-ready but remains unshipped until it completes a
real Excel-host request, receives a Vanta result, and exercises an approval-gated
workbook action through the same session.
