# Vanta desktop redesign review

This is a design plan and interactive browser prototype. It does not replace Vanta or connect to its runtime.

- `REDESIGN-PLAN.md`: full architecture, feature mapping, migration and implementation sequence.
- `FEATURE-PRESERVATION.csv`: all 245 shell entries and 51 Vanta capability entries, with original source rows.
- `prototype/`: Claude-layout review candidate with Chat/Code and local Profiles.
- `PROTOTYPE-VERIFICATION.md`: executed browser checks and remaining limits.
- `evidence/`: REA summaries, artifact metadata, bounded static excerpts, and the preserved first prototype.

Start locally from this directory:

```sh
python3 -m http.server 8876 --bind 127.0.0.1
```

Open http://127.0.0.1:8876/prototype/ . If another review server already uses that port, reuse it or choose a free port.

The prototype also opens directly from `prototype/index.html`; browser-local persistence and file downloads depend on browser permissions. No external libraries or network services are required.

Try Chat/Code draft restoration; the Profiles footer; More → Today, Automations, Connections, Workers & budgets; Customize; Outputs → Runs/Memory/Skills; and the Code workbench. The context rail offers a sample run. Plan prepares only; Manual demonstrates an exact-action approval and a separate verification receipt.

The terminal is a sample, not a shell. Voice/capture never requests microphone or screen access. Local file selection retains only a filename. No provider keys are collected. Integration setup, native execution and unsupported/parked features are labelled previews rather than represented as connected.

The user authorized a local checkpoint commit of the existing Vanta integration work after this review. No push or application redesign implementation is included.

Authoring scripts are retained for provenance. `revise-prototype.py` is a one-time v1-to-v2 migration and must not be rerun on the current prototype. `build-inventory.py` reads the surrounding Vanta source checkout; `finalize-audit.py` regenerates the recorded audit tables, not browser execution.
