# Schema task environments

Pure versioned task-adapter protocol: validate observations/actions/snapshots, predict and execute one transition, then verify it. `fixtures.ts` provides deterministic repo and browser adapters. `timeline.ts` records typed task outcomes through the kernel audit writer and replays them only after kernel chain verification; production I/O stays behind those injected boundaries.
