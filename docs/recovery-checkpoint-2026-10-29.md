# Preserved-work recovery checkpoint — 2026-10-29

This branch preserves recovered work. It is not a product release, acceptance
decision, installed-app update or permission to delete the private backup archive.

## What was recovered

A concurrent storage-cleanup operation removed the integration working tree.
The remaining backup archive was moved outside that deletion scope, and its
independent committed source restored in a separate checkout.

- Base source: `601bef6fefb116b720c139813b952b39bf488628`, verified against the
  live GitHub integration branch before recovery. Default `main` remains
  `4911ae44bbb35beef4511ba298475ba5a82b7e1c`; it has not been merged or changed.
- All 239 original preserved files match their recorded SHA-256 values. They
  include source/test changes, design/status documents and synthetic proof records.
- Four separately pending voice files match the October 28 preservation snapshot.
  They are preserved as pending work, not newly certified dictation behavior.
- Before adding this note and its manifest, the reconstructed working tree
  reproduced the original 47 modified/untracked status entries exactly.
- The [file manifest](recovery/preserved-work-2026-10-29.sha256) identifies all
  243 recovered files independently of the new documentation.

The 108 proof images show seeded fixture interfaces, not newly executed owner
or live-account acceptance. Their original dates, failures and limitations remain
historical. No original file was rewritten to make an assertion pass.

## Verification and remaining limits

The original-file hashes and complete status inventory are checked directly.
The recovered tree passes directory/staged secret scans, two project-lane
negative-fixture tests and ten pending-voice transport fixture tests. None of
those tests records a microphone or exercises an owner account. A whitespace
check reports one retained trailing space in the original reachability proof
note; that historical evidence is kept verbatim rather than rewritten. Normal
commit gates and independent GitHub readback must pass before publication is
reported. No full application suite or new installed-app replay was performed.

Credentials, signing material, owner application state, dependency caches,
compiled runtimes and private backup packets are not uploaded in this checkpoint.
The broader archive remains local and protected: this branch does not establish
that every historical patch, private artifact or Git reference is published.

The normal CLI selection and installed app are unchanged. The signed/notarized
agent18 candidate remains retained but is not installed by this recovery. The
full Desktop, trust/security, modularization and owner/human acceptance goals
remain open. No main merge, public release/tag, CI enablement or paid service.
