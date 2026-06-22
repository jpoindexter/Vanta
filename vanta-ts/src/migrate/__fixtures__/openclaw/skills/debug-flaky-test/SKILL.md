---
name: debug-flaky-test
description: Reproduce and isolate a flaky test before fixing it
tags: [testing, debugging]
---

Run the single failing file in isolation, then in a loop to confirm the flake.
Look for shared state, timing, and ordering dependencies. Fix the cause, then
run the loop again to prove it's stable.
