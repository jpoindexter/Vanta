# Deliverable attachments

Vanta can turn files produced by a gateway run into native chat attachments.
The final response may name a generated file, or an approved work product may
reference one. Before upload, Vanta removes local paths from visible chat copy.

## Supported files

Vanta attaches recent `png`, `jpg`, `jpeg`, `gif`, `webp`, `pdf`, `csv`, `xlsx`,
`pptx`, `html`, `txt`, and `md` files. Source, configuration, JSON, shell, and
log extensions are skipped by default.

Every candidate must:

- resolve inside the active workspace or an explicitly allowed read zone;
- pass the protected-path checks used by `read_file`;
- exist and have been modified within `VANTA_MEDIA_MAX_AGE_SEC` (one hour by default);
- come from the canonical final reply or an approved Vanta work product.

These checks run before file contents are read. Duplicate paths are uploaded
once. Unapproved work products are ignored.

## Channel behavior

Adapters declare native file support through `sendFile`. Telegram implements
the first production port using Bot API `sendDocument`, including forum-topic
routing. Channels without this port still receive sanitized text but do not read
or upload the file; the gateway logs the skipped delivery.

Successful uploads append a receipt to `.vanta/deliverable-receipts.jsonl` with
platform, transport, file name, MIME type, byte count, source, and timestamp.
Receipts never contain file contents.
