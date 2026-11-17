# Session tile serialization seam — 2026-10-25

StoredTile and toStored move to a29-line feature-local session-tile-codec module.
The serializer body remains byte-identical apart from export. Its SessionTile
dependency is type-only, so emitted JavaScript has no runtime import cycle.
All five serializer call sites retain their existing arguments and timing.

The owner store decreases3180→3153lines. Parser, loader, legacy migration,
storage and reactive owners remain in session-states: their profile/pane helpers
initialize state graphs and are not a pure seam. No migration or global-state
framework was added to obtain a larger line-count reduction.

Executed in the parent:129tests/sixfiles pass, including pure durable-identity
roundtrip, actual legacy invalid-row normalization/load/scoped save, owner
store, scope, profile rename, foreground and connection isolation. Runtime-only
tile fields remain absent from stored JSON. Renderer typecheck is a separate
gate; actual Electron restart/package acceptance is not established by this
source proof. No owner localStorage was used.

This does not complete modularization, state recovery or Desktop parity. Keep
the broad cards open until their actual acceptance evidence exists.
